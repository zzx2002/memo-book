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
ok(`productName=${conf.productName} identifier=${conf.identifier}`);
ok(`devUrl=${conf.build.devUrl} frontendDist=${conf.build.frontendDist}`);
for (const icon of conf.bundle.icon) {
  if (existsSync(`src-tauri/${icon}`)) ok(`图标存在: ${icon}`);
  else no(`图标缺失: ${icon}`);
}

const caps = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'));
if (caps.permissions.includes('sql:allow-execute')) ok('已声明 sql:allow-execute（写操作必需）');
else no('缺少 sql:allow-execute，db.execute 会被拒绝');

const ico = readFileSync('src-tauri/icons/icon.ico');
const isPng = ico.subarray(22, 26).toString('hex') === '89504e47';
if (ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 1 && isPng) ok('icon.ico 结构正确（内嵌 256x256 PNG）');
else no('icon.ico 结构异常');

const png = readFileSync('src-tauri/icons/32x32.png');
if (png.subarray(0, 8).toString('hex') === '89504e717f0d0a1a'.slice(0, 16)) ok('32x32.png 为合法 PNG');
else if (png.readUInt32BE(16) === 32 && png.readUInt32BE(20) === 32) ok('32x32.png 尺寸正确');
else no('32x32.png 异常');

console.log(bad ? `\n配置校验失败 (${bad}) ❌` : '\n配置校验通过 ✅');
process.exit(bad ? 1 : 0);
