const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayISO = (): string => toISO(new Date());

export function shiftISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function parseISO(value?: string | null): Date | null {
  if (!value) return null;
  const parts = value.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function fmtMD(value?: string | null): string {
  const d = parseISO(value);
  return d ? `${d.getMonth() + 1}月${d.getDate()}日` : '';
}

export function fmtFull(value?: string | null): string {
  const d = parseISO(value);
  return d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : '';
}

export function fmtMDW(value?: string | null): string {
  const d = parseISO(value);
  return d ? `${d.getMonth() + 1}月${d.getDate()}日 (${WEEK[d.getDay()]})` : '';
}

/** 'YYYY-MM-DDTHH:mm' | 'YYYY-MM-DD HH:mm:ss' -> '4月25日 09:00' */
export function fmtDateTime(value?: string | null): string {
  if (!value) return '';
  const [date, time] = value.replace(' ', 'T').split('T');
  if (!date) return '';
  return `${fmtMD(date)}${time ? ' ' + time.slice(0, 5) : ''}`;
}

/** 归一化为 <input type="date"> 可用的值 */
export const toDateInput = (value?: string | null): string => (value ? value.slice(0, 10) : '');

/** 归一化为 <input type="datetime-local"> 可用的值 */
export function toDateTimeInput(value?: string | null): string {
  if (!value) return '';
  return value.replace(' ', 'T').slice(0, 16);
}

/** 数据库返回的 'YYYY-MM-DD HH:mm:ss' -> 应用内的 'YYYY-MM-DDTHH:mm' */
export function normalizeDateTime(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(' ', 'T').slice(0, 16);
}

export function fmtStamp(value?: string | null): string {
  const d = value ? new Date(value.replace(' ', 'T')) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}
