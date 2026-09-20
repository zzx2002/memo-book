import { isDesktop } from './repo';

/**
 * 桌面能力封装：导出 / 导入 / 备份 / 唤起窗口 / 全局快捷键事件。
 * 桌面端走 Rust 命令（文件读写都在 Rust 侧），浏览器预览退化为下载与文件选择。
 */

export type ExportFormat = 'json' | 'markdown';

/** 另存为文件；返回保存路径，用户取消或浏览器模式返回 null */
export async function exportFile(
  fileName: string,
  contents: string,
  format: ExportFormat
): Promise<string | null> {
  if (isDesktop()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('export_text_file', {
      fileName,
      contents,
      format
    });
    return path ?? null;
  }

  const blob = new Blob([contents], {
    type: format === 'json' ? 'application/json' : 'text/markdown'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return fileName;
}

/** 选择文件并读回文本；用户取消返回 null */
export async function importFile(): Promise<string | null> {
  if (isDesktop()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<string | null>('import_text_file')) ?? null;
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

const BROWSER_BACKUP_PREFIX = 'memo-book-backup-';
const BROWSER_BACKUP_KEEP = 3;

/** 立即备份；返回备份位置说明，失败返回 null */
export async function backupNow(contents: string, stamp: string): Promise<string | null> {
  if (isDesktop()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<string>('backup_now', { contents, stamp })) ?? null;
  }

  try {
    const key = `${BROWSER_BACKUP_PREFIX}${stamp}`;
    localStorage.setItem(key, contents);
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(BROWSER_BACKUP_PREFIX))
      .sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - BROWSER_BACKUP_KEEP))) {
      localStorage.removeItem(old);
    }
    return `浏览器预览：已存入 localStorage（${key}）`;
  } catch {
    return null;
  }
}

/** 把主窗口显示并聚焦（提醒触发时用） */
export async function showMainWindow(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('show_main_window');
  } catch {
    /* 忽略：窗口不可用时不影响提醒本身 */
  }
}

/** 监听全局快捷键 / 托盘菜单发出的「快速新增」事件，返回取消订阅函数 */
export async function onQuickAdd(handler: () => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen('quick-add', () => handler());
    return unlisten;
  } catch {
    return () => {};
  }
}

/** 'YYYYMMDD-HHmm' 形式的备份文件名后缀 */
export function backupStamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(
    now.getMinutes()
  )}`;
}

/* ---------------- 设置面板用到的桌面能力 ---------------- */

export interface DataPaths {
  database: string;
  backups: string;
  data_dir: string;
}

/** 开机自启是否已开启；浏览器预览恒为 null（不支持） */
export async function isAutostartEnabled(): Promise<boolean | null> {
  if (!isDesktop()) return null;
  try {
    const mod = await import('@tauri-apps/plugin-autostart');
    return await mod.isEnabled();
  } catch {
    return null;
  }
}

/** 切换开机自启；返回切换后的状态，失败返回 null */
export async function setAutostart(enabled: boolean): Promise<boolean | null> {
  if (!isDesktop()) return null;
  try {
    const mod = await import('@tauri-apps/plugin-autostart');
    if (enabled) await mod.enable();
    else await mod.disable();
    return await mod.isEnabled();
  } catch {
    return null;
  }
}

/** 数据库与备份的真实路径 */
export async function getDataPaths(): Promise<DataPaths | null> {
  if (!isDesktop()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<DataPaths>('data_paths');
  } catch {
    return null;
  }
}

/** 在系统文件管理器里打开数据目录 */
export async function openDataDir(): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('open_data_dir');
  } catch {
    return null;
  }
}

/** 已有备份文件名（新的在前） */
export async function listBackups(): Promise<string[]> {
  if (!isDesktop()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string[]>('list_backups');
  } catch {
    return [];
  }
}

/** 用系统默认浏览器打开链接；桌面端走 Rust 命令，浏览器预览用 window.open */
export async function openUrl(url: string): Promise<boolean> {
  if (!url.startsWith('https://')) return false;
  if (isDesktop()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_url', { url });
      return true;
    } catch {
      return false;
    }
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}
