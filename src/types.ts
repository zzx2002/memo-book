export type Priority = 'high' | 'medium' | 'low';

/** 重复规则 */
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';

export type FolderColor = 'orange' | 'green' | 'blue' | 'purple' | 'pink' | 'teal';

export interface Folder {
  id: number;
  name: string;
  color: FolderColor;
  sortOrder: number;
}

export interface Task {
  id: number;
  title: string;
  /** 任务说明（详情面板大文本框） */
  note: string;
  /** 其他备注（可选） */
  remark: string;
  done: boolean;
  priority: Priority;
  folderId: number | null;
  /** 排期：开始日期 YYYY-MM-DD */
  startDate: string | null;
  /** 截止日期 YYYY-MM-DD */
  dueDate: string | null;
  /** 提醒时间 YYYY-MM-DDTHH:mm */
  remindAt: string | null;
  /** 重复规则 */
  repeat: RepeatRule;
  /** 手动排序位次（越小越靠前） */
  sortOrder: number;
  /** 已弹出提醒的时间，防止重复提醒 */
  notifiedAt: string | null;
  /** 软删除时间，非 null 表示在回收站里 */
  deletedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type NewTask = Pick<Task, 'title'> & Partial<Omit<Task, 'id' | 'title'>>;

export type SmartViewId = 'inbox' | 'today' | 'upcoming' | 'done' | 'trash';

export type View = { type: 'smart'; id: SmartViewId } | { type: 'folder'; id: number };

export type SortKey = 'created' | 'due' | 'priority' | 'manual';

export interface TaskPatch {
  title?: string;
  note?: string;
  remark?: string;
  done?: boolean;
  priority?: Priority;
  folderId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  remindAt?: string | null;
  repeat?: RepeatRule;
  sortOrder?: number;
  notifiedAt?: string | null;
  deletedAt?: string | null;
  completedAt?: string | null;
}

/** 数据访问层：SQLite（桌面）与 localStorage（浏览器预览）共用同一接口 */
export interface Repo {
  readonly kind: 'sqlite' | 'local';
  listFolders(): Promise<Folder[]>;
  createFolder(name: string, color: FolderColor): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;
  listTasks(): Promise<Task[]>;
  /** 回收站里的待办（已软删除） */
  listTrash(): Promise<Task[]>;
  createTask(input: NewTask): Promise<Task>;
  updateTask(id: number, patch: TaskPatch): Promise<void>;
  /** 软删除：进回收站 */
  deleteTask(id: number): Promise<void>;
  /** 从回收站恢复 */
  restoreTask(id: number): Promise<void>;
  /** 彻底删除单条 */
  purgeTask(id: number): Promise<void>;
  /** 清空回收站 */
  clearTrash(): Promise<void>;
  /** 按给定顺序回写 sort_order，用于拖拽排序 */
  reorderTasks(orderedIds: number[]): Promise<void>;
  clearCompleted(): Promise<void>;
  loadDemoData(): Promise<void>;
}
