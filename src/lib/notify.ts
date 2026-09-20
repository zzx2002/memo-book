import { isDesktop } from './repo';

/**
 * 发送一条提醒通知。
 * 桌面端走 Tauri 原生通知；浏览器预览退化到 Web Notification。
 */
export async function sendReminder(title: string, body: string): Promise<boolean> {
  if (isDesktop()) {
    try {
      const mod = await import('@tauri-apps/plugin-notification');
      let granted = await mod.isPermissionGranted();
      if (!granted) granted = (await mod.requestPermission()) === 'granted';
      if (!granted) return false;
      mod.sendNotification({ title, body });
      return true;
    } catch {
      return false;
    }
  }

  const NotificationCtor = (globalThis as { Notification?: typeof Notification }).Notification;
  if (!NotificationCtor) return false;
  try {
    let permission = NotificationCtor.permission;
    if (permission === 'default') permission = await NotificationCtor.requestPermission();
    if (permission !== 'granted') return false;
    new NotificationCtor(title, { body });
    return true;
  } catch {
    return false;
  }
}
