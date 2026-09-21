/** 静态校验：JSON 配置是否合法、图标文件是否存在且格式正确 */
import { readFileSync, existsSync } from 'node:fs';

let bad = 0;
const ok = (m) => console.log('✔', m);
const no = (m) => {
  console.error('✘', m);
  bad += 1;
};

for (const file of ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/capabilities/default.json']) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
    ok(`JSON 合法: ${file}`);
  } catch (e) {
    no(`JSON 非法: ${file} -> ${e.message}`);
  }
}

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const win = conf.app.windows[0];
ok(`窗口: ${win.title} ${win.width}x${win.height} (min ${win.minWidth}x${win.minHeight})`);
if (win.dragDropEnabled === false) ok('dragDropEnabled=false（Windows 下启用前端 HTML5 拖拽的必要条件）');
else no('dragDropEnabled 未显式关闭：Windows 上系统级文件拖放会抢走前端拖拽事件');
ok(`productName=${conf.productName} identifier=${conf.identifier}`);
ok(`devUrl=${conf.build.devUrl} frontendDist=${conf.build.frontendDist}`);
for (const icon of conf.bundle.icon) {
  if (existsSync(`src-tauri/${icon}`)) ok(`图标存在: ${icon}`);
  else no(`图标缺失: ${icon}`);
}

const caps = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'));
if (caps.permissions.includes('sql:allow-execute')) ok('已声明 sql:allow-execute（写操作必需）');
else no('缺少 sql:allow-execute，db.execute 会被拒绝');
if (caps.permissions.includes('notification:default')) ok('已声明 notification:default（到点提醒必需）');
else no('缺少 notification:default，sendNotification 会被拒绝');
if (caps.permissions.includes('autostart:default')) ok('已声明 autostart:default（开机自启必需）');
else no('缺少 autostart:default，enable/disable 会被拒绝');

// Rust 侧依赖与插件注册要和前端调用对得上
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
const CARGO_DEPS = [
  'tauri-plugin-notification',
  'tauri-plugin-dialog',
  'tauri-plugin-global-shortcut',
  'tauri-plugin-window-state',
  'tauri-plugin-single-instance',
  'tauri-plugin-autostart'
];
for (const dep of CARGO_DEPS) {
  if (cargo.includes(dep)) ok(`Cargo.toml 已引入 ${dep}`);
  else no(`Cargo.toml 缺少 ${dep}`);
}
if (cargo.includes('features = ["tray-icon"]')) ok('Cargo.toml 已开启 tauri 的 tray-icon feature');
else no('Cargo.toml 未开启 tray-icon feature，托盘无法创建');

const libRs = readFileSync('src-tauri/src/lib.rs', 'utf8');
const RUST_MARKERS = [
  ['tauri_plugin_notification::init()', '通知插件'],
  ['tauri_plugin_dialog::init()', '文件对话框插件'],
  ['tauri_plugin_single_instance', '单实例插件'],
  ['tauri_plugin_window_state', '窗口状态插件'],
  ['tauri_plugin_global_shortcut', '全局快捷键插件'],
  ['tauri_plugin_autostart', '开机自启插件'],
  ['build_tray', '托盘构建'],
  ['CmdOrCtrl+Shift+Space', '快速新增快捷键'],
  ['WindowEvent::CloseRequested', '关闭到托盘']
];
for (const [needle, label] of RUST_MARKERS) {
  if (libRs.includes(needle)) ok(`lib.rs 已实现：${label}`);
  else no(`lib.rs 缺少：${label}`);
}
for (const n of ['1', '2', '3', '4']) {
  if (libRs.includes(`version: ${n},`)) ok(`lib.rs 已注册迁移 v${n}`);
  else no(`lib.rs 缺少迁移 v${n}`);
}
const filesRs = readFileSync('src-tauri/src/files.rs', 'utf8');
const aiRs = readFileSync('src-tauri/src/ai.rs', 'utf8');
for (const cmd of ['ai_key_status', 'ai_set_key', 'ai_clear_key', 'ai_chat']) {
  if (libRs.includes(`ai::${cmd}`) && aiRs.includes(`pub fn ${cmd}`)) ok(`Rust 命令已注册：${cmd}`);
  else if (libRs.includes(`ai::${cmd}`) && aiRs.includes(`pub async fn ${cmd}`)) ok(`Rust 命令已注册：${cmd}`);
  else no(`Rust 命令未注册或未实现：${cmd}`);
}
if (aiRs.includes('api.deepseek.com')) ok('ai.rs 指向 DeepSeek 官方端点');
else no('ai.rs 未指向 DeepSeek 端点');
if (aiRs.includes('keyring::Entry') || aiRs.includes('Entry::new')) ok('ai.rs 使用系统凭据管理器保存 Key');
else no('ai.rs 未使用凭据管理器，Key 可能被落盘');
if (cargo.includes('keyring') && cargo.includes('reqwest')) ok('Cargo.toml 已引入 keyring 与 reqwest');
else no('Cargo.toml 缺少 keyring 或 reqwest');

for (const cmd of [
  'export_text_file',
  'import_text_file',
  'backup_now',
  'list_backups',
  'show_main_window',
  'data_paths',
  'open_data_dir',
  'open_url'
]) {
  if (libRs.includes(`files::${cmd}`) && filesRs.includes(`pub async fn ${cmd}`)) ok(`Rust 命令已注册：${cmd}`);
  else if (libRs.includes(`files::${cmd}`) && filesRs.includes(`pub fn ${cmd}`)) ok(`Rust 命令已注册：${cmd}`);
  else no(`Rust 命令未注册或未实现：${cmd}`);
}

// 版本号三处必须一致，另加一份给界面展示的常量
const versionConst = readFileSync('src/lib/version.ts', 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const confVersion = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
if (versionConst === packageVersion && packageVersion === confVersion) {
  ok(`版本号一致：v${packageVersion}（package.json / tauri.conf.json / src/lib/version.ts）`);
} else {
  no(`版本号不一致：package.json=${packageVersion} tauri.conf.json=${confVersion} version.ts=${versionConst}`);
}

const JS_PLUGINS = ['@tauri-apps/plugin-sql', '@tauri-apps/plugin-notification'];
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const dep of JS_PLUGINS) {
  if (pkg.dependencies?.[dep]) ok(`前端依赖存在: ${dep}`);
  else no(`前端缺少依赖: ${dep}`);
}

// 布局不变量：三栏都必须带 min-h-0
// flex/grid 子项默认 min-height:auto，内容一高整列会被撑过窗口高度，
// 内部的 overflow-y-auto 就拿不到有界高度 → 滚动条失效、下方内容被裁掉。
const columns = [
  ['src/App.tsx', 'grid min-h-0'],
  ['src/components/Sidebar.tsx', 'flex min-h-0'],
  ['src/components/TaskList.tsx', 'flex min-h-0'],
  ['src/components/DetailPanel.tsx', 'flex min-h-0']
];
for (const [file, needle] of columns) {
  if (readFileSync(file, 'utf8').includes(needle)) ok(`内部滚动不变量: ${file}`);
  else no(`${file} 缺少 "${needle}"，该列的内部滚动会失效`);
}

const ico = readFileSync('src-tauri/icons/icon.ico');const isPng = ico.subarray(22, 26).toString('hex') === '89504e47';
if (ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 1 && isPng) ok('icon.ico 结构正确（内嵌 256x256 PNG）');
else no('icon.ico 结构异常');

const png = readFileSync('src-tauri/icons/32x32.png');
if (png.subarray(0, 8).toString('hex') === '89504e717f0d0a1a'.slice(0, 16)) ok('32x32.png 为合法 PNG');
else if (png.readUInt32BE(16) === 32 && png.readUInt32BE(20) === 32) ok('32x32.png 尺寸正确');
else no('32x32.png 异常');

console.log(bad ? `\n配置校验失败 (${bad}) ❌` : '\n配置校验通过 ✅');
process.exit(bad ? 1 : 0);
