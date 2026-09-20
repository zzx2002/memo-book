import type { FolderColor, Priority, SmartViewId, SortKey } from '../types';

export const DESC_MAX = 1000;

export const PRIORITY: Record<Priority, { label: string; color: string }> = {
  high: { label: '高', color: '#e2483d' },
  medium: { label: '中', color: '#f59f0a' },
  low: { label: '低', color: '#3b82f6' }
};

export const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low'];

export const FOLDER_COLORS: Record<FolderColor, string> = {
  orange: '#f0a12f',
  green: '#34c759',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  teal: '#14b8a6'
};

export const PALETTE: FolderColor[] = ['orange', 'green', 'blue', 'purple', 'pink', 'teal'];

export const NO_FOLDER_COLOR = '#dcdfe6';

export const folderHex = (color?: FolderColor | null): string =>
  (color && FOLDER_COLORS[color]) || NO_FOLDER_COLOR;

export const SMART_VIEWS: Record<SmartViewId, { label: string; sub: string }> = {
  inbox: { label: '收件箱', sub: '记录一切，整理成行动' },
  today: { label: '今天', sub: '今天要完成的事' },
  upcoming: { label: '即将到来', sub: '已经排好期的待办' },
  done: { label: '已完成', sub: '已经收尾的记录' }
};

export const SMART_ORDER: SmartViewId[] = ['inbox', 'today', 'upcoming', 'done'];

export const SORTS: Record<SortKey, string> = {
  created: '按创建时间',
  due: '按截止日期',
  priority: '按优先级'
};

export const SORT_ORDER: SortKey[] = ['created', 'due', 'priority'];

export const STORAGE_KEY = 'memo-book-v1';
