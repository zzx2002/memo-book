import type { Task } from '../types';
import { parseISO } from './dates';

/** 'YYYY-MM-DDTHH:mm' -> 本地时间 Date */
export function parseRemindAt(value: string): Date | null {
  const [date, time] = value.split('T');
  const d = parseISO(date);
  if (!d) return null;
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  d.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return d;
}

/** 刚启动时补发的时间窗：早于这个窗口的提醒视为过期，不再打扰 */
export const STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 提前量可选项（分钟） */
export const REMIND_BEFORE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '准时' },
  { value: 5, label: '提前 5 分钟' },
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 1440, label: '提前 1 天' }
];

export function remindBeforeLabel(minutes: number): string {
  return REMIND_BEFORE_OPTIONS.find((o) => o.value === minutes)?.label ?? `提前 ${minutes} 分钟`;
}

/** 实际触发提醒的时刻 = 提醒时间 - 提前量 */
export function fireTimeOf(task: Pick<Task, 'remindAt' | 'remindBefore'>): Date | null {
  if (!task.remindAt) return null;
  const at = parseRemindAt(task.remindAt);
  if (!at) return null;
  const lead = Number.isFinite(task.remindBefore) ? Math.max(0, task.remindBefore) : 0;
  return new Date(at.getTime() - lead * 60 * 1000);
}

export interface ReminderSplit {
  /** 需要立刻弹出的提醒 */
  fire: Task[];
  /** 已经过期太久、只需标记为已提醒的 */
  stale: Task[];
}

/**
 * 纯函数：从任务列表里挑出到点的提醒（触发时刻已计入提前量）。
 * 只考虑未完成、未删除、未提醒过且设置了提醒时间的任务。
 */
export function splitDueReminders(
  tasks: Task[],
  now: Date = new Date(),
  staleWindowMs: number = STALE_WINDOW_MS
): ReminderSplit {
  const fire: Task[] = [];
  const stale: Task[] = [];
  for (const task of tasks) {
    if (task.done || task.deletedAt || task.notifiedAt || !task.remindAt) continue;
    const at = fireTimeOf(task);
    if (!at || at.getTime() > now.getTime()) continue;
    if (now.getTime() - at.getTime() <= staleWindowMs) fire.push(task);
    else stale.push(task);
  }
  return { fire, stale };
}

/** 提醒通知的正文 */
export function reminderBody(task: Task, folderName: string): string {
  const parts: string[] = [];
  const at = fireTimeOf(task);
  if (at) {
    parts.push(
      `${at.getMonth() + 1}月${at.getDate()}日 ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    );
  }
  if (task.remindBefore > 0) parts.push(remindBeforeLabel(task.remindBefore));
  parts.push(folderName);
  if (task.priority === 'high') parts.push('高优先级');
  return parts.join(' · ');
}

