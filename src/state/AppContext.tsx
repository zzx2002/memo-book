import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react';
import { PALETTE, SMART_VIEWS } from '../lib/constants';
import { fmtMD, todayISO } from '../lib/dates';
import { sendReminder } from '../lib/notify';
import { reminderBody, splitDueReminders } from '../lib/reminder';
import { buildNextOccurrence } from '../lib/repeat';
import { getRepo } from '../lib/repo';
import type { Folder, FolderColor, Priority, SortKey, Task, TaskPatch, View } from '../types';

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** 提醒轮询间隔与跨天刷新间隔 */
const HEARTBEAT_MS = 30 * 1000;

export interface Counts {
  inbox: number;
  today: number;
  upcoming: number;
  done: number;
  trash: number;
  folders: Record<number, number>;
}

export interface ToastState {
  text: string;
  /** 可撤销操作 */
  undo?: () => void;
}

interface AppApi {
  ready: boolean;
  storage: 'sqlite' | 'local';
  error: string | null;
  tasks: Task[];
  folders: Folder[];
  view: View;
  sort: SortKey;
  selectedId: number | null;
  showDone: boolean;
  counts: Counts;
  listTitle: string;
  listSub: string;
  activeTasks: Task[];
  doneTasks: Task[];
  /** 回收站内的待办（已按删除时间倒序） */
  trashTasks: Task[];
  selectedTask: Task | null;
  toast: ToastState | null;
  /** 正在内联重命名的任务 id */
  editingId: number | null;
  startEdit: (id: number) => void;
  commitEdit: (id: number, title: string) => void;
  cancelEdit: () => void;
  /** 新增文件夹时推荐的配色 */
  nextFolderColor: FolderColor;
  /** 搜索关键词 */
  query: string;
  setQuery: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement>;
  focusSearch: () => void;
  /** 拖拽排序：按新顺序回写 */
  reorder: (orderedIds: number[]) => void;
  addInputRef: RefObject<HTMLInputElement>;
  focusAddInput: () => void;
  setView: (view: View) => void;
  setSort: (sort: SortKey) => void;
  select: (id: number | null) => void;
  setShowDone: (value: boolean) => void;
  notify: (message: string, undo?: () => void) => void;
  addTask: (title: string) => Promise<void>;
  updateTask: (id: number, patch: TaskPatch) => void;
  toggleDone: (id: number) => void;
  /** 软删除，进回收站（可撤销） */
  removeTask: (id: number) => void;
  restoreTask: (id: number) => void;
  purgeTask: (id: number) => void;
  clearTrash: () => void;
  clearCompleted: () => void;
  loadDemo: () => void;
  addFolder: (name: string, color: FolderColor) => Promise<void>;
  removeFolder: (id: number) => void;
  folderById: (id: number | null) => Folder | null;
}

const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => getRepo(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [view, setViewState] = useState<View>({ type: 'smart', id: 'inbox' });
  const [sort, setSort] = useState<SortKey>('created');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [query, setQuery] = useState('');
  const [trash, setTrash] = useState<Task[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const addInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  /** 给轮询定时器与键盘导航读取的最新状态 */
  const tasksRef = useRef<Task[]>([]);
  const foldersRef = useRef<Folder[]>([]);
  const navRef = useRef<{ ids: number[]; index: number }>({ ids: [], index: -1 });
  const beatRef = useRef<() => void>(() => {});

  /* ---------- 初始载入 ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [fs, ts, tr] = await Promise.all([
          repo.listFolders(),
          repo.listTasks(),
          repo.listTrash()
        ]);
        if (!alive) return;
        setFolders(fs);
        setTasks(ts);
        setTrash(tr);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [repo]);

  const notify = useCallback((message: string, undo?: () => void) => {
    setToast({ text: message, undo });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    // 可撤销的提示留久一点，给用户反应时间
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 5000 : 1700);
  }, []);

  const focusAddInput = useCallback(() => addInputRef.current?.focus(), []);
  const focusSearch = useCallback(() => searchInputRef.current?.focus(), []);

  /* ---------- 状态镜像：供定时器与全局按键读取 ---------- */
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  /* ---------- 心跳：到点提醒 + 跨天刷新 ---------- */
  useEffect(() => {
    const beat = () => {
      // 让 todayISO() 相关的统计与筛选在跨天后自动重算
      setTick((v) => v + 1);

      const { fire, stale } = splitDueReminders(tasksRef.current);
      if (!fire.length && !stale.length) return;

      // 过期太久的只标记不再打扰，避免开机后一次性炸出一堆旧提醒
      for (const task of [...fire, ...stale]) {
        const stamp = new Date().toISOString();
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, notifiedAt: stamp } : t)));
        void repo.updateTask(task.id, { notifiedAt: stamp }).catch(() => undefined);
      }

      for (const task of fire) {
        const folder = foldersRef.current.find((f) => f.id === task.folderId);
        void sendReminder(`提醒：${task.title}`, reminderBody(task, folder ? folder.name : '未分类'));
      }
      if (fire.length) notify(`已提醒 ${fire.length} 条待办`);
    };

    beatRef.current = beat;
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [notify, repo]);

  // 启动后再补一次检查：应用关闭期间到点的提醒，开机时补发（窗口期内）
  useEffect(() => {
    if (ready) beatRef.current();
  }, [ready]);
  const folderById = useCallback(
    (id: number | null) => (id == null ? null : folders.find((f) => f.id === id) ?? null),
    [folders]
  );

  /* ---------- 统计 ---------- */
  const counts = useMemo<Counts>(() => {
    const today = todayISO();
    const acc: Counts = { inbox: 0, today: 0, upcoming: 0, done: 0, trash: trash.length, folders: {} };
    for (const t of tasks) {
      if (t.done) {
        acc.done += 1;
        continue;
      }
      acc.inbox += 1;
      if (t.folderId != null) acc.folders[t.folderId] = (acc.folders[t.folderId] ?? 0) + 1;
      if (t.dueDate && t.dueDate <= today) acc.today += 1;
      else if (t.dueDate) acc.upcoming += 1;
    }
    return acc;
    // tick：跨天时让“今天 / 即将到来”自动翻页
  }, [tasks, trash, tick]);

  /* ---------- 过滤 + 排序 ---------- */
  const { activeTasks, doneTasks, matched } = useMemo(() => {
    const today = todayISO();
    const keyword = query.trim().toLowerCase();
    // 先按视图圈定范围（不区分完成状态），再拆成未完成 / 已完成两组，
    // 这样「收件箱 / 今天 / 文件夹」底部也能列出范围内已完成的待办。
    const inScope = (t: Task): boolean => {
      if (view.type === 'folder') return t.folderId === view.id;
      if (view.id === 'trash') return false;
      if (view.id === 'inbox' || view.id === 'done') return true;
      if (view.id === 'today') return !!t.dueDate && t.dueDate <= today;
      return !!t.dueDate && t.dueDate > today;
    };
    const hitKeyword = (t: Task): boolean =>
      !keyword ||
      t.title.toLowerCase().includes(keyword) ||
      t.note.toLowerCase().includes(keyword) ||
      t.remark.toLowerCase().includes(keyword);

    const pool = tasks.filter((t) => inScope(t) && hitKeyword(t));
    const sorter = (a: Task, b: Task): number => {
      if (sort === 'manual') {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
      }
      if (sort === 'due') {
        const av = a.dueDate ?? '9999-99-99';
        const bv = b.dueDate ?? '9999-99-99';
        if (av !== bv) return av < bv ? -1 : 1;
        return a.createdAt < b.createdAt ? -1 : 1;
      }
      if (sort === 'priority') {
        const d = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (d !== 0) return d;
      }
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id;
    };
    return {
      activeTasks: pool.filter((t) => !t.done).sort(sorter),
      doneTasks: pool.filter((t) => t.done).sort(sorter),
      matched: pool.length
    };
  }, [tasks, view, sort, query, tick]);

  /** 键盘上下键导航用的可见列表快照 */
  useEffect(() => {
    const ids = activeTasks.map((t) => t.id);
    navRef.current = { ids, index: selectedId == null ? -1 : ids.indexOf(selectedId) };
  }, [activeTasks, selectedId]);

  /** 回收站列表（同样受搜索框影响） */
  const trashTasks = useMemo(() => {
    const key = query.trim().toLowerCase();
    return trash
      .filter(
        (t) =>
          !key || t.title.toLowerCase().includes(key) || t.note.toLowerCase().includes(key)
      )
      .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)) || b.id - a.id);
  }, [trash, query]);

  const listTitle = view.type === 'smart' ? SMART_VIEWS[view.id].label : folderById(view.id)?.name ?? '文件夹';
  const keyword = query.trim();
  const isTrash = view.type === 'smart' && view.id === 'trash';
  const listSub = keyword
    ? `在「${listTitle}」中匹配 “${keyword}” · ${isTrash ? trashTasks.length : matched} 条`
    : view.type === 'smart'
      ? SMART_VIEWS[view.id].sub
      : '按文件夹归类，保持专注';
  const selectedTask = useMemo(
    () => (selectedId == null ? null : tasks.find((t) => t.id === selectedId) ?? null),
    [selectedId, tasks]
  );

  /* ---------- 视图切换 ---------- */
  const setView = useCallback((next: View) => {
    setViewState(next);
    setSelectedId(null);
  }, []);

  const select = useCallback((id: number | null) => setSelectedId(id), []);

  /* ---------- 任务增删改 ---------- */
  const addTask = useCallback(
    async (title: string) => {
      const value = title.trim();
      if (!value) return;
      const input: Parameters<typeof repo.createTask>[0] = { title: value };
      if (view.type === 'folder') input.folderId = view.id;
      else if (view.id === 'today') input.dueDate = todayISO();
      try {
        const created = await repo.createTask(input);
        setTasks((prev) => [...prev, created]);
        // “已完成”视图里新增的待办不会是已完成状态，切回收件箱避免“加了却看不到”
        if (view.type === 'smart' && view.id === 'done') {
          setViewState({ type: 'smart', id: 'inbox' });
          notify('新待办已放入收件箱');
        }
        setSelectedId(created.id);
      } catch (e) {
        notify('新增失败：' + (e instanceof Error ? e.message : String(e)));
      }
    },
    [notify, repo, view]
  );

  const updateTask = useCallback(
    (id: number, patch: TaskPatch) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
                completedAt:
                  patch.done === undefined ? t.completedAt : patch.done ? new Date().toISOString() : null
              }
            : t
        )
      );
      void repo.updateTask(id, patch).catch(() => notify('保存失败'));
    },
    [notify, repo]
  );

  /** 完成一个重复任务：本轮标记完成，并自动生成下一次实例 */
  const completeRepeating = useCallback(
    async (task: Task) => {
      const next = buildNextOccurrence(task);
      updateTask(task.id, { done: true, repeat: 'none' });
      if (!next) {
        notify('已完成');
        return;
      }
      try {
        const created = await repo.createTask({
          title: next.title,
          note: next.note,
          remark: next.remark,
          priority: next.priority,
          folderId: next.folderId,
          startDate: next.startDate,
          dueDate: next.dueDate,
          remindAt: next.remindAt,
          repeat: next.repeat
        });
        setTasks((prev) => [...prev, created]);
        notify(next.dueDate ? `已完成，下一次：${fmtMD(next.dueDate)}` : '已完成，已生成下一次');
      } catch (e) {
        notify('生成下一次失败：' + (e instanceof Error ? e.message : String(e)));
      }
    },
    [notify, repo, updateTask]
  );

  const toggleDone = useCallback(
    (id: number) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.done) {
        updateTask(id, { done: false });
        notify('已恢复为未完成');
        return;
      }
      if (task.repeat !== 'none') {
        void completeRepeating(task);
        return;
      }
      updateTask(id, { done: true });
      notify('已完成');
    },
    [completeRepeating, notify, tasks, updateTask]
  );

  /** 拖拽排序：按给定顺序回写 sort_order */
  const reorder = useCallback(
    (orderedIds: number[]) => {
      if (!orderedIds.length) return;
      const rank = new Map(orderedIds.map((id, index) => [id, index]));
      setTasks((prev) =>
        prev.map((t) => (rank.has(t.id) ? { ...t, sortOrder: rank.get(t.id) as number } : t))
      );
      void repo.reorderTasks(orderedIds).catch(() => notify('排序保存失败'));
    },
    [notify, repo]
  );

  const removeTask = useCallback(
    (id: number) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      const stamped = { ...task, deletedAt: new Date().toISOString() };
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setTrash((prev) => [stamped, ...prev]);
      setSelectedId((cur) => (cur === id ? null : cur));
      setEditingId((cur) => (cur === id ? null : cur));
      void repo.deleteTask(id).catch(() => notify('删除失败'));
      // 软删除：提示里直接给一次反悔机会
      notify('已移入回收站', () => {
        setTrash((prev) => prev.filter((t) => t.id !== id));
        setTasks((prev) => [...prev, task]);
        void repo.restoreTask(id).catch(() => notify('撤销失败'));
        notify('已恢复');
      });
    },
    [notify, repo, tasks]
  );

  const restoreTask = useCallback(
    (id: number) => {
      const task = trash.find((t) => t.id === id);
      if (!task) return;
      setTrash((prev) => prev.filter((t) => t.id !== id));
      setTasks((prev) => [...prev, { ...task, deletedAt: null }]);
      void repo.restoreTask(id).catch(() => notify('恢复失败'));
      notify('已恢复到收件箱');
    },
    [notify, repo, trash]
  );

  const purgeTask = useCallback(
    (id: number) => {
      if (!window.confirm('彻底删除这条待办？此操作不可撤销。')) return;
      setTrash((prev) => prev.filter((t) => t.id !== id));
      void repo.purgeTask(id).catch(() => notify('删除失败'));
      notify('已彻底删除');
    },
    [notify, repo]
  );

  const clearTrash = useCallback(() => {
    if (!trash.length) {
      notify('回收站是空的');
      return;
    }
    if (!window.confirm(`彻底删除回收站里的 ${trash.length} 条待办？此操作不可撤销。`)) return;
    setTrash([]);
    void repo.clearTrash().catch(() => notify('清空失败'));
    notify('回收站已清空');
  }, [notify, repo, trash]);

  const clearCompleted = useCallback(() => {
    const targets = tasks.filter((t) => t.done);
    if (!targets.length) {
      notify('暂无已完成待办');
      return;
    }
    if (!window.confirm(`将 ${targets.length} 条已完成待办移入回收站？`)) return;
    const stamp = new Date().toISOString();
    setTasks((prev) => prev.filter((t) => !t.done));
    setTrash((prev) => [...targets.map((t) => ({ ...t, deletedAt: stamp })), ...prev]);
    setSelectedId((cur) => (cur != null && targets.some((t) => t.id === cur) ? null : cur));
    void repo.clearCompleted().catch(() => notify('清除失败'));
    notify(`已将 ${targets.length} 条移入回收站`, () => {
      setTrash((prev) => prev.filter((t) => !targets.some((x) => x.id === t.id)));
      setTasks((prev) => [...prev, ...targets]);
      void Promise.all(targets.map((t) => repo.restoreTask(t.id))).catch(() => notify('撤销失败'));
      notify('已恢复');
    });
  }, [notify, repo, tasks]);

  /* ---------- 内联重命名 ---------- */
  const startEdit = useCallback((id: number) => setEditingId(id), []);
  const cancelEdit = useCallback(() => setEditingId(null), []);
  const commitEdit = useCallback(
    (id: number, title: string) => {
      setEditingId(null);
      const value = title.trim();
      const task = tasks.find((t) => t.id === id);
      if (!task || !value || value === task.title) return;
      updateTask(id, { title: value });
    },
    [tasks, updateTask]
  );

  const loadDemo = useCallback(() => {
    if (!window.confirm('载入示例数据？现有内容会与示例数据合并。')) return;
    void (async () => {
      try {
        await repo.loadDemoData();
        const [fs, ts] = await Promise.all([repo.listFolders(), repo.listTasks()]);
        setFolders(fs);
        setTasks(ts);
        notify('已载入示例数据');
      } catch (e) {
        notify('载入失败：' + (e instanceof Error ? e.message : String(e)));
      }
    })();
  }, [notify, repo]);

  /* ---------- 文件夹 ---------- */
  const addFolder = useCallback(
    async (name: string, color: FolderColor) => {
      const value = name.trim();
      if (!value) return;
      try {
        const folder = await repo.createFolder(value, color);
        setFolders((prev) => [...prev, folder]);
        notify(`已新增文件夹「${folder.name}」`);
      } catch (e) {
        notify('新增文件夹失败：' + (e instanceof Error ? e.message : String(e)));
      }
    },
    [notify, repo]
  );

  const removeFolder = useCallback(
    (id: number) => {
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;
      if (!window.confirm(`删除文件夹「${folder.name}」？其中的待办会移动到「未分类」。`)) return;
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setTasks((prev) => prev.map((t) => (t.folderId === id ? { ...t, folderId: null } : t)));
      if (view.type === 'folder' && view.id === id) setViewState({ type: 'smart', id: 'inbox' });
      void repo.deleteFolder(id).catch(() => notify('删除失败'));
    },
    [folders, notify, repo, view]
  );

  /* ---------- 快捷键 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === 'Escape') {
        if (!typing) setSelectedId(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) {
        // Ctrl/Cmd+F 与 Ctrl/Cmd+K 都聚焦搜索框
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
          e.preventDefault();
          focusSearch();
        }
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        focusAddInput();
      }
      if (e.key === '/') {
        e.preventDefault();
        focusSearch();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const { ids, index } = navRef.current;
        if (!ids.length) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const base = index === -1 ? (step === 1 ? -1 : ids.length) : index;
        const next = Math.min(ids.length - 1, Math.max(0, base + step));
        setSelectedId(ids[next]);
        return;
      }
      const map: Record<string, View> = {
        '1': { type: 'smart', id: 'inbox' },
        '2': { type: 'smart', id: 'today' },
        '3': { type: 'smart', id: 'upcoming' },
        '4': { type: 'smart', id: 'done' },
        '5': { type: 'smart', id: 'trash' }
      };
      const target = map[e.key];
      if (target) setView(target);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusAddInput, focusSearch, setView]);

  const palette = useMemo(() => {
    const used = new Set(folders.map((f) => f.color));
    return PALETTE.find((c) => !used.has(c)) ?? PALETTE[folders.length % PALETTE.length];
  }, [folders]);

  const api: AppApi = {
    ready,
    storage: repo.kind,
    error,
    tasks,
    folders,
    view,
    sort,
    selectedId,
    showDone,
    counts,
    listTitle,
    listSub,
    activeTasks,
    doneTasks,
    trashTasks,
    selectedTask,
    toast,
    editingId,
    startEdit,
    commitEdit,
    cancelEdit,
    nextFolderColor: palette,
    query,
    setQuery,
    searchInputRef,
    focusSearch,
    reorder,
    addInputRef,
    focusAddInput,
    setView,
    setSort,
    select,
    setShowDone,
    notify,
    addTask,
    updateTask,
    toggleDone,
    removeTask,
    restoreTask,
    purgeTask,
    clearTrash,
    clearCompleted,
    loadDemo,
    addFolder,
    removeFolder,
    folderById
  };

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}
