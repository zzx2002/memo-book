import type { Task } from '../types';

/**
 * 「今天 / 即将到来」的归属判定。
 *
 * 这两个视图必须覆盖所有带日期的任务，否则会出现
 * "只设了排期、没设截止日期" 的任务在三个视图里全都消失的问题。
 *
 * - 今天：已经开始（排期 ≤ 今天）或今天到期/已逾期
 * - 即将到来：不满足"今天"、但排期或截止日期在未来
 *
 * 侧栏计数与列表筛选共用这里的判断，避免两者算错不到一块去。
 */
export function isTodayTask(task: Task, today: string): boolean {
  if (task.done || task.deletedAt) return false;
  const dueReached = !!task.dueDate && task.dueDate <= today;
  const alreadyStarted = !!task.startDate && task.startDate <= today;
  return dueReached || alreadyStarted;
}

export function isUpcomingTask(task: Task, today: string): boolean {
  if (task.done || task.deletedAt) return false;
  if (isTodayTask(task, today)) return false;
  const dueLater = !!task.dueDate && task.dueDate > today;
  const startsLater = !!task.startDate && task.startDate > today;
  return dueLater || startsLater;
}

/** 列表行上要展示的日期：优先截止日期，其次排期开始日期 */
export function rowDateLabel(
  task: Pick<Task, 'dueDate' | 'startDate'>
): { text: string; kind: 'due' | 'start' | 'none' } {
  if (task.dueDate) return { text: task.dueDate, kind: 'due' };
  if (task.startDate) return { text: task.startDate, kind: 'start' };
  return { text: '', kind: 'none' };
}
