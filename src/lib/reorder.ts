/**
 * 手动排序的纯函数：把 dragId 移动到 targetId 所在的位置。
 * 返回新数组；参数非法时原样返回。
 */
export function moveTo(ids: number[], dragId: number, targetId: number): number[] {
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 把 id 顺序回写成 sortOrder 值 */
export function toSortOrder(ids: number[]): Array<{ id: number; sortOrder: number }> {
  return ids.map((id, index) => ({ id, sortOrder: index }));
}
