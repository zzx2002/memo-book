import { APP_VERSION } from './version';

/** 仓库坐标与端点；换成别的仓库只需要改这两个常量 */
export const RELEASES_API = 'https://api.github.com/repos/zzx2002/memo-book/releases/latest';
export const RELEASES_PAGE = 'https://github.com/zzx2002/memo-book/releases/latest';

export interface ReleaseInfo {
  /** 去掉前导 v 的版本号 */
  version: string;
  /** 发布页地址 */
  url: string;
  /** 更新说明 */
  notes: string;
  /** 发布时间（ISO 字符串，可能为空） */
  publishedAt: string;
}

/**
 * 比较版本号：a > b 返回正数，相等返回 0，a < b 返回负数。
 * 支持前导 v、任意段数；数字段按数值比较，非数字段（预发布标记）按字典序并在数字段之后。
 */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) =>
    String(v ?? '')
      .trim()
      .replace(/^[vV]/, '')
      .split(/[.\-+]/)
      .filter((s) => s.length > 0);

  const left = norm(a);
  const right = norm(b);
  const len = Math.max(left.length, right.length);

  for (let i = 0; i < len; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return r !== undefined && /^\d+$/.test(r) ? -1 : 1;
    if (r === undefined) return /^\d+$/.test(l) ? 1 : -1;

    const ln = /^\d+$/.test(l);
    const rn = /^\d+$/.test(r);
    if (ln && rn) {
      const diff = Number(l) - Number(r);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (ln !== rn) {
      // 数字段优先于预发布标记：1.0.0 > 1.0.0-beta
      return ln ? 1 : -1;
    } else if (l !== r) {
      return l > r ? 1 : -1;
    }
  }
  return 0;
}

export function isNewer(candidate: string, current: string = APP_VERSION): boolean {
  return compareVersions(candidate, current) > 0;
}

/** 解析 GitHub release JSON；结构不对时返回 null */
export function parseRelease(json: unknown): ReleaseInfo | null {
  const data = json as {
    tag_name?: unknown;
    name?: unknown;
    html_url?: unknown;
    body?: unknown;
    published_at?: unknown;
    draft?: unknown;
    prerelease?: unknown;
  } | null;
  if (!data || typeof data !== 'object') return null;
  if (data.draft === true || data.prerelease === true) return null;

  const raw = typeof data.tag_name === 'string' && data.tag_name ? data.tag_name : data.name;
  if (typeof raw !== 'string' || !raw.trim()) return null;

  return {
    version: raw.trim().replace(/^[vV]/, ''),
    url: typeof data.html_url === 'string' && data.html_url ? data.html_url : RELEASES_PAGE,
    notes: typeof data.body === 'string' ? data.body : '',
    publishedAt: typeof data.published_at === 'string' ? data.published_at : ''
  };
}

/** 取最新 release；失败时抛出可读错误 */
export async function fetchLatestRelease(
  fetcher: typeof fetch = fetch,
  timeoutMs = 8000
): Promise<ReleaseInfo> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetcher(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error('仓库还没有发布任何 release');
      if (response.status === 403) throw new Error('GitHub 接口限流，稍后再试');
      throw new Error(`GitHub 返回 ${response.status}`);
    }
    const info = parseRelease(await response.json());
    if (!info) throw new Error('release 信息格式异常');
    return info;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('检查更新超时');
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 发布时间的美化显示 */
export function formatReleaseDate(info: ReleaseInfo): string {
  if (!info.publishedAt) return '';
  const d = new Date(info.publishedAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
