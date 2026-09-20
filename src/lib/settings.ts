import { STORAGE_KEY } from './constants';

export type AutoBackupInterval = 'daily' | 'weekly' | 'off';

export interface Settings {
  /** 回收站保留天数，0 表示永久保留 */
  trashRetentionDays: number;
  /** 自动备份频率 */
  autoBackup: AutoBackupInterval;
}

export const DEFAULT_SETTINGS: Settings = {
  trashRetentionDays: 30,
  autoBackup: 'daily'
};

export const TRASH_RETENTION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 0, label: '永久保留' }
];

export const AUTO_BACKUP_OPTIONS: Array<{ value: AutoBackupInterval; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'off', label: '关闭' }
];

export const AUTO_BACKUP_HOURS: Record<AutoBackupInterval, number> = {
  daily: 20,
  weekly: 24 * 7 - 4,
  off: Number.POSITIVE_INFINITY
};

const SETTINGS_KEY = `${STORAGE_KEY}-settings`;

/** 读取设置；损坏或缺失时回落到默认值 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function normalizeSettings(input: Partial<Settings> | null | undefined): Settings {
  const days = Number(input?.trashRetentionDays);
  const backup = input?.autoBackup;
  return {
    trashRetentionDays: Number.isFinite(days) && days >= 0 ? Math.floor(days) : DEFAULT_SETTINGS.trashRetentionDays,
    autoBackup:
      backup === 'daily' || backup === 'weekly' || backup === 'off' ? backup : DEFAULT_SETTINGS.autoBackup
  };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 忽略写入失败 */
  }
}

export function trashRetentionLabel(days: number): string {
  return days <= 0 ? '永久保留' : `保留 ${days} 天`;
}
