import type { Folder, FolderColor, NewTask, Repo, Task, TaskPatch } from '../../types';
import { normalizeDateTime, shiftISO } from '../dates';
import { SEED_FOLDERS, SEED_TASKS } from '../seed';

type Row = Record<string, unknown>;

interface SqlDb {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<{ lastInsertId?: number; rowsAffected: number }>;
}

let dbPromise: Promise<SqlDb> | null = null;

/** 懒加载：只有真正运行在 Tauri 里才会请求 sqlite 连接（database 名与 Rust 端迁移一致） */
function getDb(): Promise<SqlDb> {
  if (!dbPromise) {
    dbPromise = import('@tauri-apps/plugin-sql').then(
      (mod) => mod.default.load('sqlite:memo.db') as unknown as Promise<SqlDb>
    );
  }
  return dbPromise;
}

function rowToFolder(r: Row): Folder {
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    color: (r.color as FolderColor) ?? 'blue',
    sortOrder: Number(r.sort_order ?? 0)
  };
}

function rowToTask(r: Row): Task {
  return {
    id: Number(r.id),
    title: String(r.title ?? ''),
    note: String(r.note ?? ''),
    remark: String(r.remark ?? ''),
    done: Number(r.done) === 1,
    priority: (r.priority as Task['priority']) ?? 'low',
    folderId: r.folder_id === null || r.folder_id === undefined ? null : Number(r.folder_id),
    startDate: (r.start_date as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    remindAt: normalizeDateTime(r.remind_at as string | null),
    repeat: (r.repeat_rule as Task['repeat']) ?? 'none',
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at ?? ''),
    completedAt: normalizeDateTime(r.completed_at as string | null)
  };
}

const COLUMN: Record<keyof TaskPatch, string> = {
  title: 'title',
  note: 'note',
  remark: 'remark',
  done: 'done',
  priority: 'priority',
  folderId: 'folder_id',
  startDate: 'start_date',
  dueDate: 'due_date',
  remindAt: 'remind_at',
  repeat: 'repeat_rule',
  sortOrder: 'sort_order',
  completedAt: 'completed_at'
};

function bindValue(key: keyof TaskPatch, value: unknown): unknown {
  if (key === 'done') return value ? 1 : 0;
  return value ?? null;
}

async function selectTask(id: number): Promise<Task> {
  const db = await getDb();
  const rows = await db.select<Row[]>('SELECT * FROM tasks WHERE id = $1', [id]);
  return rowToTask(rows[0] ?? {});
}

async function insertTask(input: NewTask): Promise<Task> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO tasks (title, note, remark, done, priority, folder_id, start_date, due_date, remind_at, repeat_rule, sort_order, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE((SELECT MAX(sort_order) + 1 FROM tasks), 0), datetime('now'), $11)`,
    [
      input.title,
      input.note ?? '',
      input.remark ?? '',
      input.done ? 1 : 0,
      input.priority ?? 'low',
      input.folderId ?? null,
      input.startDate ?? null,
      input.dueDate ?? null,
      input.remindAt ?? null,
      input.repeat ?? 'none',
      input.completedAt ?? null
    ]
  );
  return selectTask(Number(res.lastInsertId));
}

export const sqliteRepo: Repo = {
  kind: 'sqlite',

  async listFolders() {
    const db = await getDb();
    const rows = await db.select<Row[]>('SELECT * FROM folders ORDER BY sort_order, id');
    return rows.map(rowToFolder);
  },

  async createFolder(name, color) {
    const db = await getDb();
    const res = await db.execute(
      `INSERT INTO folders (name, color, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM folders), 0))`,
      [name, color]
    );
    const rows = await db.select<Row[]>('SELECT * FROM folders WHERE id = $1', [Number(res.lastInsertId)]);
    return rowToFolder(rows[0] ?? {});
  },

  async deleteFolder(id) {
    const db = await getDb();
    await db.execute('UPDATE tasks SET folder_id = NULL WHERE folder_id = $1', [id]);
    await db.execute('DELETE FROM folders WHERE id = $1', [id]);
  },

  async listTasks() {
    const db = await getDb();
    const rows = await db.select<Row[]>('SELECT * FROM tasks ORDER BY created_at, id');
    return rows.map(rowToTask);
  },

  createTask: insertTask,

  async updateTask(id, patch) {
    const keys = (Object.keys(patch) as (keyof TaskPatch)[]).filter((k) => patch[k] !== undefined);
    if (!keys.length) return;
    const db = await getDb();
    const sets = keys.map((k, i) => `${COLUMN[k]} = $${i + 1}`);
    const values = keys.map((k) => bindValue(k, patch[k]));
    values.push(id);
    await db.execute(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  },

  async deleteTask(id) {
    const db = await getDb();
    await db.execute('DELETE FROM tasks WHERE id = $1', [id]);
  },

  async reorderTasks(orderedIds) {
    const db = await getDb();
    for (let index = 0; index < orderedIds.length; index += 1) {
      await db.execute('UPDATE tasks SET sort_order = $1 WHERE id = $2', [index, orderedIds[index]]);
    }
  },

  async clearCompleted() {
    const db = await getDb();
    await db.execute('DELETE FROM tasks WHERE done = 1');
  },

  async loadDemoData() {
    const folders = await sqliteRepo.listFolders();
    if (!folders.length) {
      for (const f of SEED_FOLDERS) await sqliteRepo.createFolder(f.name, f.color);
    }
    const all = await sqliteRepo.listFolders();
    const byKey = new Map<string, number>();
    SEED_FOLDERS.forEach((f) => {
      const hit = all.find((x) => x.name === f.name);
      if (hit) byKey.set(f.key, hit.id);
    });
    for (const t of SEED_TASKS) {
      await insertTask({
        title: t.title,
        note: t.note ?? '',
        priority: t.priority,
        folderId: byKey.get(t.folder) ?? null,
        startDate: t.startOffset == null ? null : shiftISO(t.startOffset),
        dueDate: t.dueOffset == null ? null : shiftISO(t.dueOffset),
        remindAt: t.remindTime && t.dueOffset != null ? `${shiftISO(t.dueOffset)}T${t.remindTime}` : null,
        done: !!t.done,
        completedAt: t.done && t.doneOffset != null ? `${shiftISO(t.doneOffset)} 10:00:00` : null,
        repeat: t.repeat ?? 'none'
      });
    }
  }
};
