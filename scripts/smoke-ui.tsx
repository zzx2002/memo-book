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
expect(navCount('今天') === '3', '“今天”计数为 3', `应为 3，实际 ${navCount('今天')}`);
expect(navCount('即将到来') === '5', '“即将到来”计数为 5', `应为 5，实际 ${navCount('即将到来')}`);

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
expect(activeRows().length === 3, '“今天”视图 3 条', `实际 ${activeRows().length}`);

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

/* ---------- 7. 持久化 ---------- */
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
