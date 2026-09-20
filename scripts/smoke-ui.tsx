/**
 * jsdom 端到端冒烟测试：真实挂载 App，验证初始载入、视图切换、勾选完成、新增待办。
 * 用法：pnpm check:ui
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true
});

const g = globalThis as unknown as Record<string, unknown>;
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
define('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number);
define('cancelAnimationFrame', (id: number) => clearTimeout(id));
define('IS_REACT_ACT_ENVIRONMENT', true);
dom.window.confirm = () => true;
void g;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: App } = await import('../src/App');
const act = (React as unknown as { act: (cb: () => void | Promise<void>) => Promise<void> }).act;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

const root = createRoot(document.getElementById('root') as HTMLElement);
await act(async () => {
  root.render(React.createElement(App));
});
await flush();

const rows = () => Array.from(document.querySelectorAll('.task-row'));
const doneRows = () => rows().filter((r) => r.classList.contains('done'));
const fail = (msg: string) => {
  console.error('✘', msg);
  process.exitCode = 1;
};
const ok = (msg: string) => console.log('✔', msg);

const active = rows().filter((r) => !r.classList.contains('done'));
const navCount = (label: string) =>
  Array.from(document.querySelectorAll('.nav-item')).find((b) => b.textContent?.includes(label))
    ?.querySelector('.count')?.textContent;

console.log(`初始渲染：${active.length} 条未完成 + ${doneRows().length} 条已完成`);
if (active.length !== 8) fail(`收件箱未完成应为 8 条，实际 ${active.length}`);
else ok('收件箱载入 8 条未完成');
if (doneRows().length !== 5) fail(`已完成分组应为 5 条，实际 ${doneRows().length}`);
else ok('已完成分组载入 5 条');
if (navCount('今天') !== '3') fail(`“今天”计数应为 3，实际 ${navCount('今天')}`);
else ok('“今天”计数为 3');
if (navCount('即将到来') !== '5') fail(`“即将到来”计数应为 5，实际 ${navCount('即将到来')}`);
else ok('“即将到来”计数为 5');

/* ---- 勾选完成 ---- */
const first = active[0];
const firstTitle = first.querySelector('.title')?.textContent ?? '';
await act(async () => {
  (first.querySelector('.check') as HTMLElement).dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true })
  );
});
await flush();
const afterActive = rows().filter((r) => !r.classList.contains('done'));
if (afterActive.length !== 7) fail(`勾选后未完成应为 7 条，实际 ${afterActive.length}`);
else if (doneRows().length !== 6) fail(`勾选后已完成分组应为 6 条，实际 ${doneRows().length}`);
else ok(`勾选「${firstTitle}」后未完成 8→7、已完成 5→6`);

/* ---- 视图切换：今天 ---- */
const todayNav = Array.from(document.querySelectorAll('.nav-item')).find((b) =>
  b.textContent?.includes('今天')
) as HTMLElement;
await act(async () => {
  todayNav.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});
await flush();
const todayRows = rows().filter((r) => !r.classList.contains('done'));
console.log(`“今天”视图列出 ${todayRows.length} 条未完成`);
if (todayRows.length !== 2) fail(`“今天”视图未完成应为 2 条（3 条中已勾掉 1 条），实际 ${todayRows.length}`);
else ok('“今天”视图切换与筛选正确');

/* ---- 新增待办（回车连续添加） ---- */
const input = document.querySelector('.add-box input') as HTMLInputElement;
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
await act(async () => {
  setter?.call(input, '冒烟测试：写一条新待办');
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
await flush();
await act(async () => {
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await flush();
const created = rows().some((r) => r.textContent?.includes('冒烟测试：写一条新待办'));
if (!created) fail('新增待办未出现在列表中');
else ok('新增待办成功并写入当前视图');

/* ---- 持久化（localStorage 模式） ---- */
const stored = JSON.parse(dom.window.localStorage.getItem('memo-book-v1') ?? '{}');
if (!stored.tasks?.some((t: { title: string }) => t.title === '冒烟测试：写一条新待办')) {
  fail('新增的待办未持久化');
} else ok('数据已持久化到存储层');

console.log(process.exitCode ? '\n冒烟测试失败 ❌' : '\n冒烟测试全部通过 ✅');

// 卸载后再退出，避免提示层的定时器在测试结束后触发 act 警告
await act(async () => {
  root.unmount();
});
await new Promise((resolve) => setTimeout(resolve, 50));
process.exit(process.exitCode ?? 0);
