import { addDays, parseISO, toISO } from './dates';
import type { RepeatRule, Task } from '../types';

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  none: '不重复',
  daily: '每天',
  weekly: '每周',
  monthly: '每月'
};

export const REPEAT_ORDER: RepeatRule[] = ['none', 'daily', 'weekly', 'monthly'];

/** 根据重复规则推算下一次的日期；'none' 返回 null */
export function nextDate(baseISO: string, rule: RepeatRule): string | null {
  if (rule === 'none') return null;
  const d = parseISO(baseISO);
  if (!d) return null;

  if (rule === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (rule === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else {
    // 每月：先跳到下个月 1 号，再钳制到该月最后一天（1/31 -> 2/28）
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return toISO(d);
}

/**
 * 完成一个重复任务后，生成下一次的实例。
 * 排期（开始日期）会按原本的“提前量”整体平移。
 */
export function buildNextOccurrence(task: Task): Omit<Task, 'id' | 'createdAt' | 'completedAt'> | null {
  if (task.repeat === 'none') return null;
  const base = task.dueDate;
  const next = base ? nextDate(base, task.repeat) : null;
  const dueDate = next ?? base;

  const startDate =
    task.startDate && task.dueDate && next
      ? addDays(next, -Math.max(0, daysBetweenSafe(task.dueDate, task.startDate)))
      : task.startDate;

  return {
    title: task.title,
    note: task.note,
    remark: task.remark,
    done: false,
    priority: task.priority,
    folderId: task.folderId,
    startDate,
    dueDate,
    remindAt: next && task.remindAt ? `${next}T${task.remindAt.slice(11, 16)}` : task.remindAt,
    repeat: task.repeat,
    sortOrder: Number.MAX_SAFE_INTEGER,
    notifiedAt: null,
    deletedAt: null
  };
}

function daysBetweenSafe(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((da.getTime() - db.getTime()) / 864e5);
}
