import type { Repo } from '../../types';
import { localRepo } from './local';
import { sqliteRepo } from './sqlite';

/** 运行在 Tauri 容器内时使用 SQLite，否则退化为浏览器本地存储 */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (!repo) repo = isDesktop() ? sqliteRepo : localRepo;
  return repo;
}
