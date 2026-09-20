import type { FolderColor, Priority } from '../types';

export interface SeedFolder {
  key: 'work' | 'life' | 'study';
  name: string;
  color: FolderColor;
}

export const SEED_FOLDERS: SeedFolder[] = [
  { key: 'work', name: '工作', color: 'orange' },
  { key: 'life', name: '生活', color: 'green' },
  { key: 'study', name: '学习', color: 'blue' }
];

export interface SeedTask {
  title: string;
  note?: string;
  priority: Priority;
  folder: SeedFolder['key'];
  /** 相对今天的天数；null 表示不排期 */
  dueOffset: number | null;
  startOffset?: number | null;
  /** 'HH:mm'，配合 dueOffset 生成提醒时间 */
  remindTime?: string;
  done?: boolean;
  /** 已完成任务的完成时间（相对今天的天数） */
  doneOffset?: number;
}

/** 与设计稿一致的示例数据 */
export const SEED_TASKS: SeedTask[] = [
  {
    title: '完成项目方案初稿',
    note: [
      '基于用户调研结果，完成项目方案初稿。',
      '重点包括：',
      '1. 目标与背景',
      '2. 方案设计',
      '3. 预期效果',
      '',
      '下一周一与团队同步讨论。'
    ].join('\n'),
    priority: 'high',
    folder: 'work',
    dueOffset: 0,
    startOffset: -2,
    remindTime: '09:00'
  },
  { title: '预约年度体检', priority: 'medium', folder: 'life', dueOffset: 1, startOffset: 0 },
  { title: '阅读《高效能人士的七个习惯》', priority: 'medium', folder: 'study', dueOffset: 3 },
  { title: '整理桌面与文件', priority: 'low', folder: 'life', dueOffset: 0 },
  { title: '准备下周会议材料', priority: 'high', folder: 'work', dueOffset: -1 },
  { title: '购买生日礼物', priority: 'medium', folder: 'life', dueOffset: 2 },
  { title: '复习英语单词', priority: 'low', folder: 'study', dueOffset: 6 },
  { title: '制定 5 月健身计划', priority: 'low', folder: 'life', dueOffset: 7 },
  { title: '提交上周工作总结', priority: 'medium', folder: 'work', dueOffset: -3, done: true, doneOffset: -3 },
  { title: '清理邮箱', priority: 'low', folder: 'work', dueOffset: -4, done: true, doneOffset: -4 },
  { title: '看完《人类简史》第三章', priority: 'low', folder: 'study', dueOffset: -5, done: true, doneOffset: -5 },
  { title: '整理上周会议纪要', priority: 'low', folder: 'work', dueOffset: -2, done: true, doneOffset: -2 },
  { title: '缴纳水电费', priority: 'low', folder: 'life', dueOffset: -1, done: true, doneOffset: -1 }
];
