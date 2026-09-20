import type { Folder, NewTask, Repo, Task, TaskPatch } from '../../types';
import { STORAGE_KEY } from '../constants';
import { shiftISO } from '../dates';
import { SEED_FOLDERS, SEED_TASKS } from '../seed';

/**
 * 浏览器预览用的后备实现（`pnpm dev` 直接开浏览器时使用）。
 * 桌面端永远走 SQLite；此实现保证 UI 在没有 Rust 环境时也能开发调试。
 */
interface LocalState {
  folders: Folder[];
  tasks: Task[];
  seq: number;
}

function seedState(): LocalState {
  const folders: Folder[] = SEED_FOLDERS.map((f, i) => ({
    id: i + 1,
    name: f.name,
    color: f.color,
    sortOrder: i
  }));
  const keyToId = new Map(SEED_FOLDERS.map((f, i) => [f.key, i + 1]));
  let seq = 0;
  const now = Date.now();
  const tasks: Task[] = SEED_TASKS.map((t) => {
    seq += 1;
    return {
      id: seq,
      title: t.title,
      note: t.note ?? '',
      remark: '',
      done: !!t.done,
      priority: t.priority,
      folderId: keyToId.get(t.folder) ?? null,
      startDate: t.startOffset == null ? null : shiftISO(t.startOffset),
      dueDate: t.dueOffset == null ? null : shiftISO(t.dueOffset),
      remindAt: t.remindTime && t.dueOffset != null ? `${shiftISO(t.dueOffset)}T${t.remindTime}` : null,
      createdAt: new Date(now + seq * 1000).toISOString(),
      completedAt: t.done && t.doneOffset != null ? new Date(now + t.doneOffset * 864e5).toISOString() : null
    };
  });
  return { folders, tasks, seq };
}

let state: LocalState | null = null;

function load(): LocalState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalState;
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.folders)) {
        state = { folders: parsed.folders, tasks: parsed.tasks, seq: parsed.seq ?? parsed.tasks.length + 100 };
        return state;
      }
    }
  } catch {
    /* 解析失败则回到种子数据 */
  }
  state = seedState();
  persist();
  return state;
}

function persist() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 忽略写入失败（隐私模式等） */
  }
}

const nextId = (s: LocalState) => (s.seq += 1);

export const localRepo: Repo = {
  kind: 'local',

  async listFolders() {
    return [...load().folders].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  },

  async createFolder(name, color) {
    const s = load();
    const folder: Folder = {
      id: nextId(s),
      name,
      color,
      sortOrder: s.folders.reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1
    };
    s.folders.push(folder);
    persist();
    return folder;
  },

  async deleteFolder(id) {
    const s = load();
    s.folders = s.folders.filter((f) => f.id !== id);
    s.tasks = s.tasks.map((t) => (t.folderId === id ? { ...t, folderId: null } : t));
    persist();
  },

  async listTasks() {
    return [...load().tasks];
  },

  async createTask(input: NewTask) {
    const s = load();
    const task: Task = {
      id: nextId(s),
      title: input.title,
      note: input.note ?? '',
      remark: input.remark ?? '',
      done: !!input.done,
      priority: input.priority ?? 'low',
      folderId: input.folderId ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      remindAt: input.remindAt ?? null,
      createdAt: new Date().toISOString(),
      completedAt: input.completedAt ?? null
    };
    s.tasks.push(task);
    persist();
    return task;
  },

  async updateTask(id, patch: TaskPatch) {
    const s = load();
    s.tasks = s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    persist();
  },

  async deleteTask(id) {
    const s = load();
    s.tasks = s.tasks.filter((t) => t.id !== id);
    persist();
  },

  async clearCompleted() {
    const s = load();
    s.tasks = s.tasks.filter((t) => !t.done);
    persist();
  },

  async loadDemoData() {
    state = seedState();
    persist();
  }
};
