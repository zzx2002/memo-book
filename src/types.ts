export type Priority = 'high' | 'medium' | 'low';

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
  createdAt: string;
  completedAt: string | null;
}

export type NewTask = Pick<Task, 'title'> & Partial<Omit<Task, 'id' | 'title'>>;

export type SmartViewId = 'inbox' | 'today' | 'upcoming' | 'done';

export type View = { type: 'smart'; id: SmartViewId } | { type: 'folder'; id: number };

export type SortKey = 'created' | 'due' | 'priority';

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
  completedAt?: string | null;
}

/** 数据访问层：SQLite（桌面）与 localStorage（浏览器预览）共用同一接口 */
export interface Repo {
  readonly kind: 'sqlite' | 'local';
  listFolders(): Promise<Folder[]>;
  createFolder(name: string, color: FolderColor): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;
  listTasks(): Promise<Task[]>;
  createTask(input: NewTask): Promise<Task>;
  updateTask(id: number, patch: TaskPatch): Promise<void>;
  deleteTask(id: number): Promise<void>;
  clearCompleted(): Promise<void>;
  loadDemoData(): Promise<void>;
}
