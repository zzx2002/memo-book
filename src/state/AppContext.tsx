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
import { PALETTE, PRIORITY, SMART_VIEWS } from '../lib/constants';
import { fmtMD, todayISO } from '../lib/dates';
import { sendReminder } from '../lib/notify';
import { reminderBody, splitDueReminders } from '../lib/reminder';
import { buildNextOccurrence } from '../lib/repeat';
import { getRepo } from '../lib/repo';
import {
  backupNow,
  backupStamp,
  exportFile,
  importFile,
  onQuickAdd,
  openUrl,
  showMainWindow,
  type ExportFormat
} from '../lib/desktop';
import { buildExportPayload, parseImport, planImport, toJson, toMarkdown } from '../lib/transfer';
import {
  AUTO_BACKUP_HOURS,
  loadSettings,
  normalizeSettings,
  saveSettings,
  type Settings
} from '../lib/settings';
import { fetchLatestRelease, isNewer, RELEASES_PAGE, type ReleaseInfo } from '../lib/updates';
import type { TaskDraft } from '../lib/ai';
import type { Folder, FolderColor, Priority, SortKey, Task, TaskPatch, View } from '../types';

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** 统一的 patch 合并：done 变化时同步 completedAt */
function mergePatch(task: Task, patch: TaskPatch): Task {
  return {
    ...task,
    ...patch,
    completedAt: patch.done === undefined ? task.completedAt : patch.done ? new Date().toISOString() : null
  };
}

/** 提醒轮询间隔与跨天刷新间隔 */
const HEARTBEAT_MS = 30 * 1000;
const LAST_BACKUP_KEY = 'memo-book-last-backup';

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

/** 检查更新的状态机 */
export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'error';

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
  /** 导出为 JSON / Markdown，返回保存位置；用户取消返回 null */
  exportData: (format: ExportFormat) => Promise<string | null>;
  /** 从 JSON 备份导入（只新增不覆盖） */
  importData: () => Promise<void>;
  /** 立刻写一份备份 */
  runBackup: (silent?: boolean) => Promise<void>;
  /** 应用设置 */
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** 设置面板开关 */
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  /** 多选与批量操作 */
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  selectedIds: number[];
  toggleSelected: (id: number) => void;
  selectAllVisible: () => void;
  clearSelection: () => void;
  bulkComplete: () => void;
  bulkDelete: () => void;
  bulkSetPriority: (priority: Priority) => void;
  bulkSetFolder: (folderId: number | null) => void;
  /** AI 整理会议记录 */
  aiOpen: boolean;
  openAi: () => void;
  closeAi: () => void;
  importDrafts: (drafts: TaskDraft[]) => Promise<void>;
  /** 检查更新（中间态：只提示 + 打开下载页，不做自动安装） */
  updateStatus: UpdateStatus;
  updateInfo: ReleaseInfo | null;
  updateError: string | null;
  checkForUpdates: (silent?: boolean) => Promise<void>;
  openReleasePage: () => Promise<void>;
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
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectMode, setSelectModeState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<ReleaseInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const addInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  /** 给轮询定时器与键盘导航读取的最新状态 */
  const tasksRef = useRef<Task[]>([]);
  const foldersRef = useRef<Folder[]>([]);
  const trashRef = useRef<Task[]>([]);
  const navRef = useRef<{ ids: number[]; index: number }>({ ids: [], index: -1 });
  const beatRef = useRef<() => void>(() => {});
  const checkUpdatesRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const autoCheckDone = useRef(false);

  /* ---------- 初始载入 ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 回收站自动清理：按设置的天数抹掉超期的软删除记录，避免库无限膨胀
        if (settings.trashRetentionDays > 0) {
          await repo.purgeExpiredTrash(settings.trashRetentionDays).catch(() => 0);
        }
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
  useEffect(() => {
    trashRef.current = trash;
  }, [trash]);

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
      if (fire.length) {
        // 窗口被最小化/收进托盘时主动唤出来；用户正在别处工作时只弹通知，不抢焦点
        if (typeof document !== 'undefined' && document.hidden) void showMainWindow();
        notify(`已提醒 ${fire.length} 条待办`);
      }
    };

    beatRef.current = beat;
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [notify, repo]);

  // 启动后再补一次检查：应用关闭期间到点的提醒，开机时补发（窗口期内）
  useEffect(() => {
    if (ready) beatRef.current();
  }, [ready]);

  /* ---------- 托盘 / 全局快捷键：快速新增 ---------- */
  useEffect(() => {
    let dispose: (() => void) | null = null;
    void onQuickAdd(() => {
      focusAddInput();
      notify('快速新增：输入后回车即可');
    }).then((fn) => {
      dispose = fn;
    });
    return () => dispose?.();
  }, [focusAddInput, notify]);

  /* ---------- 导出 / 导入 / 备份 ---------- */
  const exportData = useCallback(
    async (format: ExportFormat) => {
      const stamp = backupStamp();
      try {
        const contents =
          format === 'json'
            ? toJson(buildExportPayload(foldersRef.current, tasksRef.current, trashRef.current))
            : toMarkdown(foldersRef.current, tasksRef.current);
        const fileName = `memo-book-${stamp}.${format === 'json' ? 'json' : 'md'}`;
        const where = await exportFile(fileName, contents, format);
        if (where) notify(`已导出：${where}`);
        return where;
      } catch (e) {
        notify('导出失败：' + (e instanceof Error ? e.message : String(e)));
        return null;
      }
    },
    [notify]
  );

  const importData = useCallback(async () => {
    let text: string | null = null;
    try {
      text = await importFile();
    } catch (e) {
      notify('读取文件失败：' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    if (!text) return;

    try {
      const plan = planImport(parseImport(text), foldersRef.current, tasksRef.current);
      const nameToId = new Map(foldersRef.current.map((f) => [f.name.trim().toLowerCase(), f.id]));

      for (const folder of plan.newFolders) {
        const created = await repo.createFolder(folder.name, folder.color);
        setFolders((prev) => [...prev, created]);
        nameToId.set(created.name.trim().toLowerCase(), created.id);
      }

      let added = 0;
      for (const item of plan.newTasks) {
        const folderId = item.folderName ? nameToId.get(item.folderName.toLowerCase()) ?? null : null;
        const created = await repo.createTask({ ...item.task, folderId });
        setTasks((prev) => [...prev, created]);
        added += 1;
      }

      notify(
        added
          ? `已导入 ${added} 条待办${plan.skipped ? `，跳过 ${plan.skipped} 条重复` : ''}`
          : `没有可导入的新待办${plan.skipped ? `（跳过 ${plan.skipped} 条重复）` : ''}`
      );
    } catch (e) {
      notify('导入失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, [notify, repo]);

  const runBackup = useCallback(
    async (silent = false) => {
      const contents = toJson(buildExportPayload(foldersRef.current, tasksRef.current, trashRef.current));
      const where = await backupNow(contents, backupStamp());
      if (where) {
        try {
          localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
        } catch {
          /* 忽略存储失败 */
        }
        if (!silent) notify(`已备份：${where}`);
      } else if (!silent) {
        notify('备份失败，请检查应用数据目录权限');
      }
    },
    [notify]
  );

  // 启动时按间隔自动备份一次（频率由设置决定）
  useEffect(() => {
    if (!ready) return;
    const hours = AUTO_BACKUP_HOURS[settings.autoBackup];
    if (!Number.isFinite(hours)) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_BACKUP_KEY) ?? 0);
    } catch {
      last = 0;
    }
    if (Date.now() - last < hours * 3600 * 1000) return;
    void runBackup(true);
  }, [ready, runBackup, settings.autoBackup]);

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
      setTasks((prev) => prev.map((t) => (t.id === id ? mergePatch(t, patch) : t)));
      void repo.updateTask(id, patch).catch(() => notify('保存失败'));
    },
    [notify, repo]
  );

  /* ---------- 设置 ---------- */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = normalizeSettings({ ...prev, ...patch });
      saveSettings(next);
      return next;
    });
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  /* ---------- 多选：选中状态的维护 ---------- */
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const setSelectMode = useCallback((on: boolean) => {
    setSelectModeState(on);
    if (!on) setSelectedIds([]);
  }, []);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectAllVisible = useCallback(() => setSelectedIds(navRef.current.ids.slice()), []);

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

  /* ---------- 批量操作（依赖上面的 completeRepeating / folderById） ---------- */
  /** 批量改字段：本地乐观更新 + 批量落库 */
  const bulkPatch = useCallback(
    (patch: TaskPatch, message: string) => {
      const ids = selectedIds.slice();
      if (!ids.length) return;
      const set = new Set(ids);
      setTasks((prev) => prev.map((t) => (set.has(t.id) ? mergePatch(t, patch) : t)));
      void Promise.all(ids.map((id) => repo.updateTask(id, patch))).catch(() => notify('保存失败'));
      notify(message);
      clearSelection();
    },
    [clearSelection, notify, repo, selectedIds]
  );

  const bulkSetPriority = useCallback(
    (priority: Priority) => {
      const count = selectedIds.length;
      bulkPatch({ priority }, `已把 ${count} 条设为${PRIORITY[priority].label}优先级`);
    },
    [bulkPatch, selectedIds.length]
  );

  const bulkSetFolder = useCallback(
    (folderId: number | null) => {
      const count = selectedIds.length;
      const name = folderId == null ? '未分类' : folderById(folderId)?.name ?? '未分类';
      bulkPatch({ folderId }, `已把 ${count} 条移动到「${name}」`);
    },
    [bulkPatch, folderById, selectedIds.length]
  );

  /** 批量完成：重复任务照常生成下一次 */
  const bulkComplete = useCallback(() => {
    const ids = new Set(selectedIds);
    const targets = tasks.filter((t) => ids.has(t.id) && !t.done);
    if (!targets.length) {
      notify('选中的待办都已完成');
      clearSelection();
      return;
    }
    const plain = targets.filter((t) => t.repeat === 'none').map((t) => t.id);
    const repeating = targets.filter((t) => t.repeat !== 'none');
    if (plain.length) {
      const plainSet = new Set(plain);
      const stamp = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) => (plainSet.has(t.id) ? { ...t, done: true, completedAt: stamp } : t))
      );
      void Promise.all(plain.map((id) => repo.updateTask(id, { done: true, completedAt: stamp }))).catch(
        () => notify('保存失败')
      );
    }
    for (const task of repeating) void completeRepeating(task);
    notify(`已完成 ${targets.length} 条`);
    clearSelection();
  }, [clearSelection, completeRepeating, notify, repo, selectedIds, tasks]);

  /** 批量删除（软删除，可撤销） */
  const bulkDelete = useCallback(() => {
    const ids = new Set(selectedIds);
    const targets = tasks.filter((t) => ids.has(t.id));
    if (!targets.length) return;
    const stamp = new Date().toISOString();
    setTasks((prev) => prev.filter((t) => !ids.has(t.id)));
    setTrash((prev) => [...targets.map((t) => ({ ...t, deletedAt: stamp })), ...prev]);
    setSelectedId((cur) => (cur != null && ids.has(cur) ? null : cur));
    clearSelection();
    void Promise.all(targets.map((t) => repo.deleteTask(t.id))).catch(() => notify('删除失败'));
    notify(`已移入回收站 ${targets.length} 条`, () => {
      setTrash((prev) => prev.filter((t) => !ids.has(t.id)));
      setTasks((prev) => [...prev, ...targets]);
      void Promise.all(targets.map((t) => repo.restoreTask(t.id))).catch(() => notify('撤销失败'));
      notify('已恢复');
    });
  }, [clearSelection, notify, repo, selectedIds, tasks]);

  /* ---------- 检查更新（中间态：只提示并可跳转下载页） ---------- */
  const openReleasePage = useCallback(async () => {
    const url = updateInfo?.url ?? RELEASES_PAGE;
    const opened = await openUrl(url);
    if (!opened) notify('打开下载页失败，可手动访问 ' + url);
  }, [notify, updateInfo]);

  const checkForUpdates = useCallback(
    async (silent = false) => {
      setUpdateStatus('checking');
      setUpdateError(null);
      try {
        const info = await fetchLatestRelease();
        if (isNewer(info.version)) {
          setUpdateInfo(info);
          setUpdateStatus('available');
          notify(`发现新版本 v${info.version}`, () => {
            void openReleasePage();
          });
        } else {
          setUpdateInfo(null);
          setUpdateStatus('latest');
          if (!silent) notify('已是最新版本');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setUpdateError(message);
        setUpdateStatus(silent ? 'idle' : 'error');
        if (!silent) notify('检查更新失败：' + message);
      }
    },
    [notify, openReleasePage]
  );

  useEffect(() => {
    checkUpdatesRef.current = checkForUpdates;
  }, [checkForUpdates]);

  // 启动后静默检查一次，有新版本才提示，失败不打扰
  useEffect(() => {
    if (!ready || autoCheckDone.current) return;
    autoCheckDone.current = true;
    const timer = window.setTimeout(() => void checkUpdatesRef.current(true), 15000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  /* ---------- AI 整理：把确认过的草稿批量写入 ---------- */
  const openAi = useCallback(() => setAiOpen(true), []);
  const closeAi = useCallback(() => setAiOpen(false), []);

  const importDrafts = useCallback(
    async (drafts: TaskDraft[]) => {
      const nameToId = new Map(foldersRef.current.map((f) => [f.name.trim().toLowerCase(), f.id]));
      const created: Task[] = [];
      for (const draft of drafts) {
        const title = draft.title.trim();
        if (!title) continue;
        const folderId = draft.folderName
          ? nameToId.get(draft.folderName.trim().toLowerCase()) ?? null
          : null;
        try {
          const task = await repo.createTask({
            title,
            note: draft.note,
            priority: draft.priority,
            folderId,
            dueDate: draft.dueDate,
            remindAt: draft.remindAt,
            repeat: 'none'
          });
          created.push(task);
        } catch {
          /* 单条失败不阻塞其余 */
        }
      }

      if (!created.length) {
        notify('没有导入任何待办');
        return;
      }
      setTasks((prev) => [...prev, ...created]);
      setViewState({ type: 'smart', id: 'inbox' });
      setAiOpen(false);
      notify(`已导入 ${created.length} 条待办`, () => {
        const ids = new Set(created.map((t) => t.id));
        setTasks((prev) => prev.filter((t) => !ids.has(t.id)));
        setSelectedId((cur) => (cur != null && ids.has(cur) ? null : cur));
        void Promise.all(created.map((t) => repo.purgeTask(t.id))).catch(() => notify('撤销失败'));
        notify('已撤销导入');
      });
    },
    [notify, repo]
  );

  /* ---------- 文件夹 ---------- */
  const addFolder = useCallback(    async (name: string, color: FolderColor) => {
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
        if (!typing) {
          if (settingsOpen) {
            setSettingsOpen(false);
            return;
          }
          if (selectMode) {
            setSelectModeState(false);
            setSelectedIds([]);
            return;
          }
          setSelectedId(null);
        }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) {
        // Ctrl/Cmd+F 与 Ctrl/Cmd+K 都聚焦搜索框
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
          e.preventDefault();
          focusSearch();
        }
        // 多选模式下 Ctrl/Cmd+A 全选当前列表
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && selectMode && !typing) {
          e.preventDefault();
          selectAllVisible();
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
  }, [focusAddInput, focusSearch, selectAllVisible, selectMode, setView, settingsOpen]);

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
    exportData,
    importData,
    runBackup,
    settings,
    updateSettings,
    settingsOpen,
    openSettings,
    closeSettings,
    selectMode,
    setSelectMode,
    selectedIds,
    toggleSelected,
    selectAllVisible,
    clearSelection,
    bulkComplete,
    bulkDelete,
    bulkSetPriority,
    bulkSetFolder,
    updateStatus,
    updateInfo,
    updateError,
    checkForUpdates,
    openReleasePage,
    aiOpen,
    openAi,
    closeAi,
    importDrafts,
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
