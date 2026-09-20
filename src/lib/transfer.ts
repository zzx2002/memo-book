import type { Folder, FolderColor, NewTask, Priority, Task } from '../types';
import { fmtDateTime, fmtMD } from './dates';

export const EXPORT_VERSION = 1;

export interface ExportPayload {
  app: 'memo-book';
  version: number;
  exportedAt: string;
  folders: Folder[];
  tasks: Task[];
}

/** 导出用的完整快照（含回收站里的记录，保证可完整还原） */
export function buildExportPayload(
  folders: Folder[],
  tasks: Task[],
  trash: Task[],
  now: Date = new Date()
): ExportPayload {
  return {
    app: 'memo-book',
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    folders,
    tasks: [...tasks, ...trash]
  };
}

export function toJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

const PRIORITY_MARK: Record<Priority, string> = { high: '高', medium: '中', low: '低' };

/** 导出为便于阅读/粘贴的 Markdown */
export function toMarkdown(folders: Folder[], tasks: Task[], now: Date = new Date()): string {
  const active = tasks.filter((t) => !t.deletedAt);
  const lines: string[] = [];
  lines.push('# 我的记事簿');
  lines.push('');
  lines.push(
    `> 导出时间：${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · 共 ${active.length} 条`
  );
  lines.push('');

  const groups: Array<{ name: string; list: Task[] }> = folders
    .map((f) => ({ name: f.name, list: active.filter((t) => t.folderId === f.id) }))
    .filter((g) => g.list.length > 0);
  const loose = active.filter((t) => t.folderId == null || !folders.some((f) => f.id === t.folderId));
  if (loose.length) groups.push({ name: '未分类', list: loose });

  for (const group of groups) {
    lines.push(`## ${group.name}`);
    lines.push('');
    for (const task of group.list) {
      const marks: string[] = [PRIORITY_MARK[task.priority]];
      if (task.startDate) marks.push(`排期 ${fmtMD(task.startDate)}`);
      if (task.dueDate) marks.push(`截止 ${fmtMD(task.dueDate)}`);
      if (task.remindAt) marks.push(`提醒 ${fmtDateTime(task.remindAt)}`);
      if (task.repeat !== 'none') marks.push('重复');
      lines.push(`- [${task.done ? 'x' : ' '}] ${task.title}  \`${marks.join(' · ')}\``);
      for (const line of task.note.split('\n')) {
        if (line.trim()) lines.push(`  > ${line}`);
      }
      if (task.remark.trim()) lines.push(`  > 备注：${task.remark.trim()}`);
    }
    lines.push('');
  }

  if (!groups.length) lines.push('_（没有待办）_');
  return lines.join('\n');
}

export interface ImportPlan {
  newFolders: Array<{ name: string; color: FolderColor }>;
  newTasks: Array<{ task: NewTask; folderName: string | null }>;
  skipped: number;
}

/** 解析导入文件，格式不对时抛出可读错误 */
export function parseImport(text: string): ExportPayload {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('不是合法的 JSON 文件');
  }
  const payload = data as Partial<ExportPayload>;
  if (!payload || payload.app !== 'memo-book' || !Array.isArray(payload.tasks)) {
    throw new Error('不是「我的记事簿」导出的备份文件');
  }
  if (typeof payload.version === 'number' && payload.version > EXPORT_VERSION) {
    throw new Error(`备份版本（v${payload.version}）比当前应用更新，请先升级应用`);
  }
  return {
    app: 'memo-book',
    version: payload.version ?? EXPORT_VERSION,
    exportedAt: payload.exportedAt ?? '',
    folders: Array.isArray(payload.folders) ? payload.folders : [],
    tasks: payload.tasks as Task[]
  };
}

/**
 * 合并策略：只新增，不覆盖已有数据。
 * 文件夹按名称匹配，重名的直接复用；待办以「标题 + 截止日期」判重。
 */
export function planImport(
  payload: ExportPayload,
  existingFolders: Folder[],
  existingTasks: Task[]
): ImportPlan {
  const folderByName = new Map(existingFolders.map((f) => [f.name.trim().toLowerCase(), f]));
  const newFolders: ImportPlan['newFolders'] = [];
  for (const folder of payload.folders) {
    const key = String(folder.name ?? '').trim().toLowerCase();
    if (!key || folderByName.has(key)) continue;
    if (newFolders.some((f) => f.name.toLowerCase() === key)) continue;
    newFolders.push({ name: String(folder.name).trim(), color: folder.color ?? 'blue' });
  }

  const seen = new Set(existingTasks.map((t) => `${t.title.trim().toLowerCase()}|${t.dueDate ?? ''}`));
  const newTasks: ImportPlan['newTasks'] = [];
  let skipped = 0;

  for (const raw of payload.tasks) {
    // 回收站里的记录不参与导入：软删除属于临时状态，不跟着备份来回搬
    if (raw.deletedAt) {
      skipped += 1;
      continue;
    }
    const title = String(raw.title ?? '').trim();
    if (!title) {
      skipped += 1;
      continue;
    }
    const dueDate = raw.dueDate ?? null;
    const key = `${title.toLowerCase()}|${dueDate ?? ''}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const folder = payload.folders.find((f) => f.id === raw.folderId);
    newTasks.push({
      folderName: folder ? String(folder.name).trim() : null,
      task: {
        title,
        note: raw.note ?? '',
        remark: raw.remark ?? '',
        done: !!raw.done,
        priority: raw.priority ?? 'low',
        folderId: null,
        startDate: raw.startDate ?? null,
        dueDate,
        remindAt: raw.remindAt ?? null,
        remindBefore: raw.remindBefore ?? 0,
        repeat: raw.repeat ?? 'none',
        sortOrder: newTasks.length,
        notifiedAt: null,
        deletedAt: null,
        completedAt: raw.completedAt ?? null
      }
    });
  }

  return { newFolders, newTasks, skipped };
}
