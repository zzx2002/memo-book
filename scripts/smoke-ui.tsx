/**
 * jsdom 端到端冒烟测试：真实挂载 App，覆盖 v0.1 基础链路与 v0.2 的搜索 / 拖拽排序 / 重复任务。
 * 用法：pnpm check:ui
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true
});

const define = (key: string, value: unknown) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

define('window', dom.window);
define('document', dom.window.document);
define('navigator', dom.window.navigator);
define('localStorage', dom.window.localStorage);
define('HTMLElement', dom.window.HTMLElement);
define('HTMLInputElement', dom.window.HTMLInputElement);
define('Event', dom.window.Event);
define('MouseEvent', dom.window.MouseEvent);
define('KeyboardEvent', dom.window.KeyboardEvent);
define('requestAnimationFrame', (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number
);
define('cancelAnimationFrame', (id: number) => clearTimeout(id));
define('IS_REACT_ACT_ENVIRONMENT', true);
dom.window.confirm = () => true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: App } = await import('../src/App');
const act = (React as unknown as { act: (cb: () => void | Promise<void>) => Promise<void> }).act;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

let failures = 0;
const fail = (msg: string) => {
  console.error('✘', msg);
  failures += 1;
};
const ok = (msg: string) => console.log('✔', msg);
const expect = (cond: boolean, pass: string, bad: string) => (cond ? ok(pass) : fail(bad));

/* ---------- DOM 辅助 ---------- */
const all = <T extends Element>(selector: string) => Array.from(document.querySelectorAll(selector)) as T[];
const rows = () => all<HTMLElement>('.task-row');
const activeRows = () => rows().filter((r) => !r.classList.contains('done'));
const doneRows = () => rows().filter((r) => r.classList.contains('done'));
const titles = (list: HTMLElement[]) => list.map((r) => r.querySelector('.title')?.textContent ?? '');
const byText = <T extends Element>(selector: string, text: string) =>
  all<T>(selector).find((el) => el.textContent?.includes(text));
const click = async (el: HTMLElement | undefined) => {
  if (!el) return;
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
const navCount = (label: string) =>
  byText<HTMLElement>('.nav-item', label)?.querySelector('.count')?.textContent;

const dragEvent = (type: string) => {
  const e = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    dataTransfer: { setData() {}, getData: () => '', effectAllowed: '', dropEffect: '' }
  });
  return e;
};
const drag = async (source: HTMLElement, target: HTMLElement) => {
  await act(async () => {
    source.dispatchEvent(dragEvent('dragstart'));
    target.dispatchEvent(dragEvent('dragover'));
    target.dispatchEvent(dragEvent('drop'));
    source.dispatchEvent(dragEvent('dragend'));
  });
  await flush();
};

const setInput = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await flush();
};

/* ---------- 挂载 ---------- */
const root = createRoot(document.getElementById('root') as HTMLElement);
await act(async () => {
  root.render(React.createElement(App));
});
await flush();

/* ---------- 1. 初始载入 ---------- */
console.log(`\n[1] 初始渲染：${activeRows().length} 条未完成 + ${doneRows().length} 条已完成`);
expect(activeRows().length === 8, '收件箱载入 8 条未完成', `应为 8 条，实际 ${activeRows().length}`);
expect(doneRows().length === 5, '已完成分组载入 5 条', `应为 5 条，实际 ${doneRows().length}`);
expect(
  navCount('今天') === '4',
  '“今天”计数为 4（3 条今天到期 + 1 条排期为今天）',
  `应为 4，实际 ${navCount('今天')}`
);
expect(navCount('即将到来') === '4', '“即将到来”计数为 4', `应为 4，实际 ${navCount('即将到来')}`);

/* ---------- 2. 搜索（v0.2） ---------- */
const searchToggle = all<HTMLElement>('.icon-btn').find((b) => b.title.startsWith('搜索'));
await click(searchToggle);
const searchInput = document.querySelector('input[placeholder="搜索标题 / 说明"]') as HTMLInputElement;
expect(!!searchInput, '搜索框可展开', '搜索框未出现');
await setInput(searchInput, '会议');
console.log(`   搜索“会议”：${activeRows().length} 条未完成 / ${doneRows().length} 条已完成`);
expect(
  activeRows().length === 1 && titles(activeRows())[0] === '准备下周会议材料',
  '搜索命中标题',
  `结果异常：${JSON.stringify(titles(activeRows()))}`
);
await setInput(searchInput, '方案设计');
expect(
  activeRows().length === 1 && titles(activeRows())[0] === '完成项目方案初稿',
  '搜索命中任务说明正文',
  `结果异常：${JSON.stringify(titles(activeRows()))}`
);
await act(async () => {
  searchInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await flush();
expect(activeRows().length === 8, 'Esc 清空搜索并恢复列表', `应为 8 条，实际 ${activeRows().length}`);

/* ---------- 3. 拖拽排序（v0.2） ---------- */
const before = titles(activeRows());
expect(
  all('.task-row .grip').length === 8,
  '默认排序下每条待办都有拖拽手柄（不再需要先切手动排序）',
  `手柄数量：${all('.task-row .grip').length}`
);

const listBefore = activeRows();
await drag(listBefore[0], listBefore[3]);
const after = titles(activeRows());
const expected = [before[1], before[2], before[3], before[0], ...before.slice(4)];
expect(
  JSON.stringify(after) === JSON.stringify(expected),
  `拖拽后顺序正确：${after[0]} / ${after[1]} / ${after[2]} / ${after[3]}`,
  `拖拽顺序异常：${JSON.stringify(after)}`
);
expect(
  !!byText<HTMLElement>('.ghost-btn', '手动排序'),
  '拖拽后自动切换为手动排序',
  '排序模式没有自动切换'
);

const storedAfterDrag = JSON.parse(dom.window.localStorage.getItem('memo-book-v1') ?? '{}');
const firstStored = storedAfterDrag.tasks?.find((t: { title: string }) => t.title === after[0]);
expect(firstStored?.sortOrder === 0, '拖拽结果已持久化 sortOrder', `sortOrder=${firstStored?.sortOrder}`);

// 排序菜单仍可切换，且切回手动排序后拖拽结果还在
await click(byText<HTMLElement>('.ghost-btn', '手动排序'));
await click(byText<HTMLElement>('.menu-item', '按创建时间'));
expect(!!byText<HTMLElement>('.ghost-btn', '按创建时间'), '排序菜单可切回按创建时间', '菜单切换失败');
await click(byText<HTMLElement>('.ghost-btn', '按创建时间'));
await click(byText<HTMLElement>('.menu-item', '手动排序'));
expect(
  JSON.stringify(titles(activeRows())) === JSON.stringify(after),
  '切回手动排序后顺序保持不变',
  `顺序丢失：${JSON.stringify(titles(activeRows()))}`
);

/* ---------- 4. 视图切换 + 新增 ---------- */
await click(byText<HTMLElement>('.nav-item', '今天'));
expect(activeRows().length === 4, '“今天”视图 4 条', `实际 ${activeRows().length}`);

const addInput = document.querySelector('.add-box input') as HTMLInputElement;
await setInput(addInput, '冒烟测试：写一条新待办');
await act(async () => {
  addInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await flush();
expect(
  titles(activeRows()).includes('冒烟测试：写一条新待办'),
  '回车新增待办成功',
  '新增的待办未出现'
);

/* ---------- 5. 重复任务（v0.2） ---------- */
await click(byText<HTMLElement>('.nav-item', '收件箱'));
const repeatRow = rows().find((r) => r.textContent?.includes('复习英语单词'));
expect(!!repeatRow, '找到每周重复的示例任务', '未找到“复习英语单词”');
await act(async () => {
  repeatRow?.querySelector('.check')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await flush();

const repeatTitles = titles(rows().filter((r) => r.textContent?.includes('复习英语单词')));
expect(repeatTitles.length === 2, '完成后自动生成下一次实例', `“复习英语单词”出现 ${repeatTitles.length} 次`);

const nextRow = rows().find(
  (r) => r.textContent?.includes('复习英语单词') && !r.classList.contains('done')
);
const expectDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 13); // 原 6 天后 + 每周 7 天
  return `${d.getMonth() + 1}月${d.getDate()}日`;
})();
expect(
  nextRow?.querySelector('.due')?.textContent?.includes(expectDate) === true,
  `下一次截止日期为 ${expectDate}`,
  `下一次日期异常：${nextRow?.querySelector('.due')?.textContent}`
);
expect(!!nextRow?.querySelector('svg'), '重复实例带重复图标', '缺少重复图标');

const storedAfterRepeat = JSON.parse(dom.window.localStorage.getItem('memo-book-v1') ?? '{}');
const finished = storedAfterRepeat.tasks?.find(
  (t: { title: string; done: boolean }) => t.title === '复习英语单词' && t.done
);
expect(finished?.repeat === 'none', '完成的那一条已停止重复', `repeat=${finished?.repeat}`);
const pending = storedAfterRepeat.tasks?.find(
  (t: { title: string; done: boolean }) => t.title === '复习英语单词' && !t.done
);
expect(pending?.repeat === 'weekly', '新实例保留每周重复规则', `repeat=${pending?.repeat}`);

/* ---------- 6. 日期选择（详情面板） ---------- */
await click(activeRows()[0]);
const dueField = all<HTMLElement>('.date-field').find(
  (f) => f.querySelector('input[aria-label="截止日期"]') !== null
);
const dueInput = dueField?.querySelector('input') as HTMLInputElement;
expect(!!dueInput, '详情面板出现截止日期控件', '未找到截止日期控件');

await click(dueField);
expect(
  document.activeElement === dueInput,
  '点击日期框会把焦点交给原生输入框（无 showPicker 的环境回退到 focus）',
  `activeElement=${document.activeElement?.tagName}`
);

const setDate = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await flush();
};

await setDate(dueInput, '2027-01-15');
const detailDisplay = dueField?.querySelector('.txt')?.textContent ?? '';
expect(detailDisplay === '2027年1月15日', '详情面板显示所选日期', `显示：${detailDisplay}`);
const rowDue = activeRows()[0]?.querySelector('.due')?.textContent ?? '';
expect(rowDue.includes('1月15日'), '列表行的截止日期同步更新', `列表显示：${rowDue}`);

const clearBtn = dueField?.querySelector('.clear') as HTMLElement;
await click(clearBtn);
expect(
  (dueField?.querySelector('.txt')?.textContent ?? '').includes('选择截止日期'),
  '清除按钮可清空日期',
  `显示：${dueField?.querySelector('.txt')?.textContent}`
);

/* ---------- 7. 软删除 / 回收站 / 撤销（v0.3） ---------- */
const beforeDelete = activeRows().length;
const victimTitle = titles(activeRows())[0];
await click(activeRows()[0]);
await click(byText<HTMLElement>('.danger-btn', '删除待办'));
expect(activeRows().length === beforeDelete - 1, '删除后立即从列表移除', `剩余 ${activeRows().length}`);
expect(!titles(activeRows()).includes(victimTitle), '被删的待办不再出现在收件箱', '仍能看到被删的待办');

const undoBtn = byText<HTMLElement>('button', '撤销');
expect(!!undoBtn, '提示条带「撤销」按钮', '没有出现撤销按钮');
await click(undoBtn);
expect(titles(activeRows()).includes(victimTitle), '撤销后原样恢复', `恢复后：${JSON.stringify(titles(activeRows()).slice(0, 3))}`);

// 再删一次并进入回收站，验证恢复链路
await click(activeRows()[0]);
await click(byText<HTMLElement>('.danger-btn', '删除待办'));
await click(byText<HTMLElement>('.nav-item', '回收站'));
const trashRows = all<HTMLElement>('.task-row');
expect(trashRows.length === 1, '回收站里有 1 条待办', `回收站实际 ${trashRows.length} 条`);
expect(trashRows[0].textContent?.includes(victimTitle) === true, '回收站里就是刚删的那条', '内容不匹配');
expect(!!byText<HTMLElement>('.nav-item', '回收站')?.querySelector('.count'), '侧栏回收站有计数', '缺少计数');

await click(byText<HTMLElement>('.ghost-btn', '恢复'));
expect(all<HTMLElement>('.task-row').length === 0, '恢复后回收站清空', '回收站仍有内容');
await click(byText<HTMLElement>('.nav-item', '收件箱'));
expect(titles(activeRows()).includes(victimTitle), '恢复的待办回到收件箱', '收件箱里找不到恢复的待办');

const storedTrash = JSON.parse(dom.window.localStorage.getItem('memo-book-v1') ?? '{}');
expect(
  storedTrash.tasks?.every((t: { deletedAt: string | null }) => !t.deletedAt),
  '恢复后存储里没有残留的软删除标记',
  '仍有 deletedAt 残留'
);

/* ---------- 8. 双击内联重命名（v0.3） ---------- */
const renameTarget = activeRows()[0];
const oldTitle = titles([renameTarget])[0];
await act(async () => {
  renameTarget.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
});
await flush();
const editInput = document.querySelector('.task-row input') as HTMLInputElement;
expect(!!editInput, '双击进入内联编辑', '没有出现编辑输入框');
await setInput(editInput, '重命名后的标题');
await act(async () => {
  editInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await flush();
expect(
  titles(activeRows()).includes('重命名后的标题') && !titles(activeRows()).includes(oldTitle),
  '回车提交新标题',
  `列表：${JSON.stringify(titles(activeRows()).slice(0, 3))}`
);

/* ---------- 9. 键盘导航（v0.3） ---------- */
await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
});
await flush();
const firstSelected = activeRows().findIndex((r) => r.classList.contains('active'));
expect(firstSelected === 0, '↓ 键选中第一条', `选中索引 ${firstSelected}`);
await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
});
await flush();
const secondSelected = activeRows().findIndex((r) => r.classList.contains('active'));
expect(secondSelected === 1, '再按 ↓ 移到第二条', `选中索引 ${secondSelected}`);
await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
});
await flush();
expect(activeRows().findIndex((r) => r.classList.contains('active')) === 0, '↑ 键回到第一条', '↑ 未生效');

/* ---------- 10. 提醒调度（纯函数） ---------- */
const { splitDueReminders } = await import('../src/lib/reminder');
const fakeTask = (
  id: number,
  remindAt: string | null,
  over: Partial<import('../src/types').Task> = {}
): import('../src/types').Task => ({
  id,
  title: `提醒 ${id}`,
  note: '',
  remark: '',
  done: false,
  priority: 'low',
  folderId: null,
  startDate: null,
  dueDate: null,
  remindAt,
  remindBefore: 0,
  repeat: 'none',
  sortOrder: id,
  notifiedAt: null,
  deletedAt: null,
  createdAt: '2026-09-01 10:00:00',
  completedAt: null,
  ...over
});

const now = new Date(2026, 8, 20, 10, 0, 0); // 2026-09-20 10:00 本地
const split = splitDueReminders(
  [
    fakeTask(1, '2026-09-20T09:30'), // 已到点半小时 -> 立刻提醒
    fakeTask(2, '2026-09-20T11:00'), // 还没到 -> 不提醒
    fakeTask(3, '2026-09-17T09:00'), // 过期 3 天 -> 只标记不打扰
    fakeTask(4, '2026-09-20T09:00', { notifiedAt: '2026-09-20T09:00' }), // 已提醒过 -> 跳过
    fakeTask(5, '2026-09-20T09:00', { done: true }), // 已完成 -> 跳过
    fakeTask(6, '2026-09-20T09:00', { deletedAt: '2026-09-20T09:10' }), // 已删除 -> 跳过
    fakeTask(7, null) // 没设提醒 -> 跳过
  ],
  now
);
expect(
  split.fire.length === 1 && split.fire[0].id === 1,
  '到点的提醒被挑出（其余全部跳过）',
  `fire=${JSON.stringify(split.fire.map((t) => t.id))}`
);
expect(
  split.stale.length === 1 && split.stale[0].id === 3,
  '过期太久的提醒只做标记不再打扰',
  `stale=${JSON.stringify(split.stale.map((t) => t.id))}`
);

/* ---------- 11. 提前量提醒（v0.4） ---------- */
const { fireTimeOf, remindBeforeLabel } = await import('../src/lib/reminder');
const lead = fireTimeOf({ remindAt: '2026-09-20T09:00', remindBefore: 15 });
expect(
  lead !== null && lead.getHours() === 8 && lead.getMinutes() === 45,
  '提前 15 分钟时，实际触发时刻为 08:45',
  `实际：${lead?.toLocaleString('zh-CN')}`
);
expect(remindBeforeLabel(15) === '提前 15 分钟', '提前量文案正确', remindBeforeLabel(15));

const withLead = splitDueReminders(
  [fakeTask(8, '2026-09-20T10:10', { remindBefore: 15 })], // 10:10 提前 15 分 -> 09:55 已到点
  now
);
expect(
  withLead.fire.length === 1,
  '提前量计入后，提醒会在 09:55 触发（当前 10:00）',
  `fire=${withLead.fire.length}`
);
const notYet = splitDueReminders(
  [fakeTask(9, '2026-09-20T10:10', { remindBefore: 0 })],
  now
);
expect(notYet.fire.length === 0, '未设提前量时 10:10 的提醒还不到点', `fire=${notYet.fire.length}`);

/* ---------- 12. 导出 / 导入（v0.4，纯函数） ---------- */
const transfer = await import('../src/lib/transfer');
const exportFolders = [{ id: 1, name: '工作', color: 'orange', sortOrder: 0 }];
const exportTasks = [
  fakeTask(21, null, {
    title: '写周报',
    note: '第一行\n第二行',
    priority: 'high',
    folderId: 1,
    dueDate: '2026-09-25'
  })
];
const payload = transfer.buildExportPayload(exportFolders, exportTasks, [], now);
const json = transfer.toJson(payload);
expect(
  JSON.parse(json).app === 'memo-book' && JSON.parse(json).tasks.length === 1,
  'JSON 导出结构正确',
  json.slice(0, 60)
);

const markdown = transfer.toMarkdown(exportFolders, exportTasks, now);
expect(
  markdown.includes('## 工作') && markdown.includes('- [ ] 写周报') && markdown.includes('截止 9月25日'),
  'Markdown 导出包含分组与元信息',
  markdown.slice(0, 120)
);
expect(markdown.includes('> 第一行'), 'Markdown 导出保留任务说明', markdown);

expect(
  (() => {
    try {
      transfer.parseImport('{"foo":1}');
      return false;
    } catch {
      return true;
    }
  })(),
  '非法备份文件会被拒绝',
  '非法文件竟然解析成功'
);

const roundTrip = transfer.parseImport(json);
const plan = transfer.planImport(roundTrip, exportFolders, []);
expect(
  plan.newFolders.length === 0 && plan.newTasks.length === 1 && plan.skipped === 0,
  '导入时复用同名文件夹，新增 1 条待办',
  JSON.stringify({ f: plan.newFolders.length, t: plan.newTasks.length, s: plan.skipped })
);
const dedup = transfer.planImport(roundTrip, exportFolders, exportTasks);
expect(dedup.newTasks.length === 0 && dedup.skipped === 1, '重复待办（同标题+同截止）会被跳过', JSON.stringify(dedup.skipped));
const withTrash = transfer.planImport(
  transfer.parseImport(transfer.toJson(transfer.buildExportPayload(exportFolders, [], [fakeTask(22, null, { title: '已删除的', deletedAt: '2026-09-19T10:00' })], now))),
  exportFolders,
  []
);
expect(withTrash.newTasks.length === 0 && withTrash.skipped === 1, '回收站内容不参与导入', JSON.stringify(withTrash));

/* ---------- 13. 设置面板（v0.5） ---------- */
const readStore = () => JSON.parse(dom.window.localStorage.getItem('memo-book-v1') ?? '{}');
const readSettings = () =>
  JSON.parse(dom.window.localStorage.getItem('memo-book-v1-settings') ?? '{}');

await click(document.querySelector('button[title="设置"]') as HTMLElement);
expect(
  (document.body.textContent ?? '').includes('回收站保留'),
  '设置面板可以打开',
  '未找到设置面板内容'
);

await click(byText<HTMLElement>('.seg-btn', '7 天'));
expect(readSettings().trashRetentionDays === 7, '回收站保留天数写入设置', JSON.stringify(readSettings()));
await click(byText<HTMLElement>('.seg-btn', '关闭'));
expect(readSettings().autoBackup === 'off', '自动备份频率写入设置', JSON.stringify(readSettings()));

await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await flush();
expect(
  !(document.body.textContent ?? '').includes('回收站保留'),
  'Esc 可关闭设置面板',
  '设置面板没有关闭'
);

/* ---------- 14. 多选与批量操作（v0.5） ---------- */
const multiBtn = document.querySelector('button[title^="多选"]') as HTMLElement;
await click(multiBtn);
expect((document.body.textContent ?? '').includes('已选 0 条'), '进入多选模式', '未进入多选模式');

await act(async () => {
  window.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })
  );
});
await flush();
const visibleCount = activeRows().length;
expect(
  (document.body.textContent ?? '').includes(`已选 ${visibleCount} 条`),
  `Ctrl+A 全选 ${visibleCount} 条`,
  `实际提示：${(document.body.textContent ?? '').match(/已选 \d+ 条/)?.[0]}`
);

// 清空全选后只留两条选中，改成高优先级
await click(byText<HTMLElement>('.ghost-btn', '清空'));
await click(activeRows()[0]);
await click(activeRows()[1]);
const pickedIds = activeRows()
  .filter((r) => r.classList.contains('active'))
  .map((r) => Number(r.getAttribute('data-task')));
expect(pickedIds.length === 2, '点选两条待办', `选中 ${pickedIds.length} 条`);

await click(byText<HTMLElement>('.ghost-btn', '优先级'));
await click(byText<HTMLElement>('.menu-item', '高优先级'));
const highPicked = readStore().tasks.filter(
  (t: { id: number; priority: string }) => pickedIds.includes(t.id) && t.priority === 'high'
);
expect(highPicked.length === 2, '批量改优先级生效', `命中 ${highPicked.length} 条`);

// 批量完成
await click(activeRows()[0]);
await click(activeRows()[1]);
const completeIds = activeRows()
  .filter((r) => r.classList.contains('active'))
  .map((r) => Number(r.getAttribute('data-task')));
await click(byText<HTMLElement>('.ghost-btn', '完成'));
const completedNow = readStore().tasks.filter(
  (t: { id: number; done: boolean }) => completeIds.includes(t.id) && t.done
);
expect(completedNow.length === 2, '批量完成生效', `完成 ${completedNow.length} 条`);

// 批量删除 + 整体撤销
await click(activeRows()[0]);
await click(activeRows()[1]);
const deleteIds = activeRows()
  .filter((r) => r.classList.contains('active'))
  .map((r) => Number(r.getAttribute('data-task')));
await click(byText<HTMLElement>('.ghost-btn', '删除'));
const trashedNow = readStore().tasks.filter(
  (t: { id: number; deletedAt: string | null }) => deleteIds.includes(t.id) && t.deletedAt
);
expect(trashedNow.length === 2, '批量删除进入回收站', `回收站 ${trashedNow.length} 条`);
await click(byText<HTMLElement>('button', '撤销'));
const restoredNow = readStore().tasks.filter(
  (t: { id: number; deletedAt: string | null }) => deleteIds.includes(t.id) && !t.deletedAt
);
expect(restoredNow.length === 2, '批量删除可整体撤销', `恢复 ${restoredNow.length} 条`);

await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await flush();
expect(
  !(document.body.textContent ?? '').includes('已选'),
  'Esc 退出多选模式',
  '多选模式未退出'
);

/* ---------- 15. 检查更新（v0.5 中间态） ---------- */
const updates = await import('../src/lib/updates');
expect(updates.compareVersions('0.5.1', '0.5.0') === 1, '版本号比较：0.5.1 > 0.5.0', '比较错误');
expect(updates.compareVersions('v0.5.0', '0.5.0') === 0, '版本号比较：忽略前导 v', '比较错误');
expect(updates.compareVersions('0.10.0', '0.9.9') === 1, '版本号比较：按数值而非字典序', '比较错误');
expect(updates.compareVersions('1.0.0-beta', '1.0.0') === -1, '预发布版本低于正式版本', '比较错误');
expect(updates.isNewer('0.5.0') === false, '同版本不算新版本', '判断错误');
expect(updates.parseRelease({ draft: true, tag_name: 'v1.0.0' }) === null, '草稿 release 会被忽略', '未忽略草稿');
expect(
  updates.parseRelease({ tag_name: 'v1.2.3', html_url: 'https://example.com', body: '说明' })?.version ===
    '1.2.3',
  'release JSON 解析正确',
  '解析错误'
);

const nativeFetch = (globalThis as { fetch?: unknown }).fetch;
const stubFetch = (payload: unknown, status = 200) =>
  (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload
    }) as unknown as Response) as unknown as typeof fetch;

await click(document.querySelector('button[title="设置"]') as HTMLElement);

define(
  'fetch',
  stubFetch({
    tag_name: 'v9.9.9',
    html_url: 'https://github.com/zzx2002/memo-book/releases/tag/v9.9.9',
    body: '这是测试用的更新说明',
    published_at: '2026-09-21T02:00:00Z'
  })
);
await click(byText<HTMLElement>('.ghost-btn', '检查更新'));
expect(
  (document.body.textContent ?? '').includes('发现新版本') &&
    (document.body.textContent ?? '').includes('9.9.9'),
  '发现新版本时给出提示与版本号',
  `面板内容未包含新版本信息`
);
expect(!!byText<HTMLElement>('.ghost-btn', '前往下载'), '提供「前往下载」按钮', '没有下载按钮');

define('fetch', stubFetch({ tag_name: 'v0.5.0', html_url: 'https://example.com' }));
await click(byText<HTMLElement>('.ghost-btn', '检查更新'));
expect(
  (document.body.textContent ?? '').includes('已是最新版本'),
  '同版本时提示已是最新',
  '未提示已是最新'
);

define(
  'fetch',
  (async () => {
    throw new Error('模拟断网');
  }) as unknown as typeof fetch
);
await click(byText<HTMLElement>('.ghost-btn', '检查更新'));
expect(
  (document.body.textContent ?? '').includes('检查失败'),
  '网络异常时给出可读错误',
  '未显示失败信息'
);

define('fetch', nativeFetch);
await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await flush();

/* ---------- 16. AI 整理会议记录（v0.6） ---------- */
const ai = await import('../src/lib/ai');

const systemPrompt = ai.buildSystemPrompt({ today: '2026-09-20', weekday: '周日', folders: ['工作', '生活'] });
expect(
  systemPrompt.includes('2026-09-20') && systemPrompt.includes('周日') && systemPrompt.includes('工作'),
  'system prompt 注入日期、星期与文件夹列表',
  'prompt 内容缺失'
);
expect(
  /json/i.test(systemPrompt),
  'prompt 中出现 “json” 字样（JSON 输出模式的硬性要求）',
  'prompt 未提及 json，模型可能不返回 JSON'
);
expect(
  systemPrompt.includes('严禁编造日期') && systemPrompt.includes('sourceQuote'),
  'prompt 包含防幻觉与溯源要求',
  'prompt 缺少关键约束'
);

expect(
  ai.extractJsonText('```json\n{"a":1}\n```') === '{"a":1}',
  '能剥离 markdown 代码块',
  ai.extractJsonText('```json\n{"a":1}\n```')
);
expect(
  ai.extractJsonText('好的，结果如下：{"a":1} 以上。') === '{"a":1}',
  '能从解释文字中裁剪出 JSON',
  ai.extractJsonText('好的，结果如下：{"a":1} 以上。')
);

const parsedAi = ai.parseAiContent(
  JSON.stringify({
    tasks: [
      {
        title: '  完成项目方案初稿  ',
        note: '先出初稿',
        priority: 'urgent',
        folderName: '工作',
        dueDate: '2026-09-25',
        remindAt: null,
        sourceQuote: '小李：方案初稿下周五前给我',
        confidence: 'high'
      },
      { title: '联系供应商', priority: 'medium', dueDate: '下周三', folderName: '不存在的分类', confidence: 'low' }
    ],
    ignored: [{ text: '聊了下季度预算', reason: '只是同步信息' }]
  })
);
expect(parsedAi.tasks.length === 2, '解析出 2 条草稿', `实际 ${parsedAi.tasks.length}`);
expect(parsedAi.tasks[0].title === '完成项目方案初稿', '标题去除首尾空白', parsedAi.tasks[0].title);
expect(parsedAi.tasks[0].priority === 'low', '非法优先级回落为 low', parsedAi.tasks[0].priority);
expect(parsedAi.tasks[1].dueDate === null, '非 YYYY-MM-DD 的日期被丢弃（防幻觉）', String(parsedAi.tasks[1].dueDate));
expect(parsedAi.ignored.length === 1, '保留被跳过的段落与原因', JSON.stringify(parsedAi.ignored));

const aiError = (input: string) => {
  try {
    ai.parseAiContent(input);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
expect(aiError('').includes('空内容'), '空返回给出可读提示（官方承认 JSON 模式会偶发）', aiError(''));
expect(aiError('这不是 JSON').includes('合法 JSON'), '非 JSON 内容给出可读提示', aiError('这不是 JSON'));
expect(
  aiError('{"tasks":[],"ignored":[]}').includes('没有整理出'),
  '空结果给出可读提示',
  aiError('{"tasks":[],"ignored":[]}')
);

// 判重用例：显式构造"已有待办"，不依赖前面 UI 操作留下的状态
const existingForDedupe = [
  {
    id: 9999,
    title: '完成项目方案初稿',
    note: '',
    remark: '',
    done: false,
    priority: 'low' as const,
    folderId: null,
    startDate: null,
    dueDate: '2026-09-25',
    remindAt: null,
    remindBefore: 0,
    repeat: 'none' as const,
    sortOrder: 0,
    notifiedAt: null,
    deletedAt: null,
    createdAt: '',
    completedAt: null
  }
];
const dupMarked = ai.markDuplicates(parsedAi.tasks, existingForDedupe);
expect(dupMarked[0].duplicate === true, '与已有待办重复的草稿被标记', '未标记重复');
expect(dupMarked[1].duplicate === false, '不重复的草稿不被标记', '误标重复');

// 注入假传输层，跑完整的「粘贴 → 整理 → 预览 → 导入 → 撤销」链路
const originalTransport = ai.getAiTransport();
ai.setAiTransport({
  available: true,
  async chat() {
    return {
      content: JSON.stringify({
        tasks: [
          {
            title: '提交季度预算表',
            note: '财务要的',
            priority: 'high',
            folderName: '工作',
            dueDate: '2026-09-30',
            sourceQuote: '老张：预算表月底前交财务',
            confidence: 'high'
          },
          {
            title: '预约牙科复诊',
            priority: 'low',
            folderName: '生活',
            dueDate: null,
            sourceQuote: '我说下周去把牙看了',
            confidence: 'low'
          },
          {
            title: '整理会议录音',
            priority: 'medium',
            folderName: '工作',
            dueDate: null,
            sourceQuote: '录音回头整理一下',
            confidence: 'medium'
          }
        ],
        ignored: []
      }),
      usage: { model: 'deepseek-flash', promptTokens: 1200, completionTokens: 180, cacheHitTokens: 900 }
    };
  }
});

await click(byText<HTMLElement>('button', 'AI 整理会议记录'));
expect(
  (document.body.textContent ?? '').includes('粘贴会议记录'),
  'AI 整理对话框可以打开',
  '对话框未打开'
);

const aiTextarea = document.querySelector(
  'textarea[placeholder^="把会议记录粘到这里"]'
) as HTMLTextAreaElement;
expect(!!aiTextarea, '找到会议记录输入框', '未找到输入框');
const textareaSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')?.set;
await act(async () => {
  textareaSetter?.call(aiTextarea, '老张：预算表月底前交财务。我说下周去把牙看了。');
  aiTextarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
await flush();

await click(byText<HTMLElement>('.ghost-btn', '开始整理'));
await flush();
expect(
  (document.body.textContent ?? '').includes('整理出 3 条待办'),
  '进入预览并显示条数',
  (document.body.textContent ?? '').match(/整理出 \d+ 条待办/)?.[0] ?? '未进入预览'
);
expect(
  (document.body.textContent ?? '').includes('把握较低'),
  '低置信度草稿被标注',
  '未标注低置信度'
);
expect(
  (document.body.textContent ?? '').includes('原文：老张：预算表月底前交财务'),
  '预览显示原文出处',
  '未显示溯源片段'
);

const tasksBeforeAi = readStore().tasks.filter((t: { deletedAt: string | null }) => !t.deletedAt).length;
await click(byText<HTMLElement>('.ghost-btn', '导入 3 条'));
await flush();
const afterAi = readStore().tasks.filter((t: { deletedAt: string | null }) => !t.deletedAt);
expect(afterAi.length === tasksBeforeAi + 3, '导入 3 条到收件箱', `新增 ${afterAi.length - tasksBeforeAi} 条`);
const budget = afterAi.find((t: { title: string }) => t.title === '提交季度预算表');
expect(
  !!budget && budget.folderId === 1 && budget.priority === 'high',
  '文件夹与优先级按草稿写入',
  JSON.stringify(budget ?? null)
);
expect(
  !(document.body.textContent ?? '').includes('粘贴会议记录'),
  '导入后对话框关闭',
  '对话框未关闭'
);

await click(byText<HTMLElement>('button', '撤销'));
const afterUndo = readStore().tasks.filter(
  (t: { title: string; deletedAt: string | null }) => t.title === '提交季度预算表' && !t.deletedAt
);
expect(afterUndo.length === 0, '导入可整体撤销', `仍剩 ${afterUndo.length} 条`);
ai.setAiTransport(originalTransport);

/* ---------- 17. 只设排期（无截止日期）也要计入「今天」（v0.6 修复） ---------- */
const views = await import('../src/lib/views');
const dayISO = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const T0 = dayISO(0);
const T1 = dayISO(1);
const T_1 = dayISO(-1);

expect(
  views.isTodayTask(fakeTask(101, null, { startDate: T0 }), T0),
  '排期为今天的任务算「今天」',
  '只设排期的任务未计入今天'
);
expect(
  views.isTodayTask(fakeTask(102, null, { startDate: T_1 }), T0),
  '昨天就开始的任务仍算「今天」（已开始未完成）',
  '已开始的任务消失了'
);
expect(
  !views.isTodayTask(fakeTask(103, null, { startDate: T1 }), T0) &&
    views.isUpcomingTask(fakeTask(103, null, { startDate: T1 }), T0),
  '未来才开始的任务算「即将到来」',
  '未来排期的任务归属错误'
);
expect(
  !views.isTodayTask(fakeTask(104, null, {}), T0) && !views.isUpcomingTask(fakeTask(104, null, {}), T0),
  '没有任何日期的任务两个视图都不算（只留在收件箱）',
  '无日期任务被错误归类'
);
expect(
  views.isTodayTask(fakeTask(105, null, { dueDate: T_1 }), T0),
  '已逾期的任务算「今天」',
  '逾期任务未计入今天'
);
expect(
  views.isUpcomingTask(fakeTask(106, null, { dueDate: T1 }), T0),
  '未来到期的任务算「即将到来」',
  '未来到期归属错误'
);
expect(
  !views.isTodayTask(fakeTask(107, null, { startDate: T0, done: true }), T0),
  '已完成的任务不算「今天」',
  '已完成任务被计入今天'
);

// 界面链路：新增一条 → 设排期为今天 → 侧栏计数 +1、行上显示「开始 …」
await click(byText<HTMLElement>('.nav-item', '收件箱'));
const todayCountOf = () => Number(byText<HTMLElement>('.nav-item', '今天')?.querySelector('.count')?.textContent ?? -1);
const todayBefore = todayCountOf();
const addInput2 = document.querySelector('.add-box input') as HTMLInputElement;
await setInput(addInput2, '排期测试任务');
await act(async () => {
  addInput2.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await flush();

const startInput = document.querySelector('input[type="date"][aria-label="排期"]') as HTMLInputElement;
expect(!!startInput, '详情面板出现排期控件', '未找到排期控件');
await setDate(startInput, T0);
const todayAfter = todayCountOf();
expect(
  todayAfter === todayBefore + 1,
  '设置排期为今天后，侧栏「今天」计数 +1',
  `${todayBefore} → ${todayAfter}`
);
const startRow = activeRows().find((r) => r.textContent?.includes('排期测试任务'));
const startRowDate = startRow?.querySelector('.due')?.textContent ?? '';
expect(
  startRowDate.includes('开始') && startRowDate.includes('月'),
  '列表行显示排期开始日期（原先完全不显示）',
  `行上显示：${startRowDate}`
);

// 切到「今天」视图应当能看到它
await click(byText<HTMLElement>('.nav-item', '今天'));
expect(
  titles(activeRows()).includes('排期测试任务'),
  '「今天」视图里能看到这条只设了排期的任务',
  `列表：${JSON.stringify(titles(activeRows()).slice(0, 4))}`
);
await click(byText<HTMLElement>('.nav-item', '收件箱'));

/* ---------- 18. 持久化 ---------- */
const stored = JSON.parse(dom.window.localStorage.getItem('memo-book-v1') ?? '{}');
expect(
  !!stored.tasks?.some((t: { title: string }) => t.title === '冒烟测试：写一条新待办'),
  '新增待办已持久化',
  '新增的待办未持久化'
);

console.log(failures ? `\n冒烟测试失败：${failures} 项 ❌` : '\n冒烟测试全部通过 ✅');

await act(async () => {
  root.unmount();
});
await new Promise((resolve) => setTimeout(resolve, 50));
process.exit(failures ? 1 : 0);
