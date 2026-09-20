/**
 * 校验 SQLite 迁移脚本：用 Node 内置 node:sqlite 在内存库里跑一遍
 * 用法：pnpm check:sql
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'src-tauri/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const db = new DatabaseSync(':memory:');
for (const file of files) {
  const sql = readFileSync(resolve(dir, file), 'utf8');
  db.exec(sql);
  console.log(`✔ 执行通过 ${file}`);
}

const one = (sql) => Object.values(db.prepare(sql).get())[0];

console.log('文件夹数量:', one('SELECT COUNT(*) FROM folders'));
console.log('待办总数  :', one('SELECT COUNT(*) FROM tasks'));
console.log('未完成    :', one('SELECT COUNT(*) FROM tasks WHERE done = 0'));
console.log("今天/逾期 :", one("SELECT COUNT(*) FROM tasks WHERE done = 0 AND due_date <= date('now')"));
console.log("即将到来  :", one("SELECT COUNT(*) FROM tasks WHERE done = 0 AND due_date > date('now')"));
console.log('已完成    :', one('SELECT COUNT(*) FROM tasks WHERE done = 1'));
console.log('优先级分布:', JSON.stringify(db.prepare('SELECT priority, COUNT(*) AS n FROM tasks GROUP BY priority').all()));
console.log('重复规则  :', JSON.stringify(db.prepare('SELECT repeat_rule, COUNT(*) AS n FROM tasks GROUP BY repeat_rule').all()));
console.log('sort_order:', JSON.stringify(db.prepare('SELECT MIN(sort_order) AS min, MAX(sort_order) AS max FROM tasks').get()));
console.log('回收站    :', one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NOT NULL'), '条');
console.log('已提醒    :', one('SELECT COUNT(*) FROM tasks WHERE notified_at IS NOT NULL'), '条');
console.log('首条说明长度:', one('SELECT LENGTH(note) FROM tasks WHERE title = \'完成项目方案初稿\''));

const columns = db
  .prepare('SELECT name FROM pragma_table_info(\'tasks\')')
  .all()
  .map((r) => r.name);
const required = ['notified_at', 'deleted_at', 'sort_order', 'repeat_rule'];
const missing = required.filter((c) => !columns.includes(c));
if (missing.length) {
  console.error('✘ tasks 表缺少列:', missing.join(', '));
  process.exit(1);
}
console.log('列齐全    :', required.join(' '));

const indexes = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name")
  .all()
  .map((r) => r.name);
console.log('索引      :', indexes.join(' '));
for (const need of ['idx_tasks_sort', 'idx_tasks_deleted']) {
  if (!indexes.includes(need)) {
    console.error(`✘ 缺少索引 ${need}`);
    process.exit(1);
  }
}

const folders = db.prepare('SELECT id, name, color FROM folders ORDER BY sort_order').all();
console.log('文件夹    :', folders.map((f) => `${f.id}:${f.name}(${f.color})`).join(' '));

// 演练一次应用层会执行的写入
db.prepare(
  `INSERT INTO tasks (title, note, remark, done, priority, folder_id, start_date, due_date, remind_at, created_at, completed_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
).run('迁移自检任务', '', '', 0, 'high', 1, null, null, null, null);
const id = one('SELECT last_insert_rowid()');
db.prepare('UPDATE tasks SET done = 1, completed_at = datetime(\'now\') WHERE id = ?').run(id);
db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
db.prepare('DELETE FROM folders WHERE id = 3').run();
console.log('写入/更新/删除演练: OK');

// 演练拖拽排序：把最后一条挪到最前，回写 sort_order
const ordered = db.prepare('SELECT id FROM tasks ORDER BY sort_order').all().map((r) => r.id);
const moved = [ordered[ordered.length - 1], ...ordered.slice(0, -1)];
const update = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
moved.forEach((id, index) => update.run(index, id));
const firstAfter = one('SELECT id FROM tasks ORDER BY sort_order LIMIT 1');
if (firstAfter !== moved[0]) {
  console.error('✘ 拖拽排序回写失败');
  process.exit(1);
}
console.log('拖拽排序回写演练: OK');

// 演练软删除 / 恢复 / 彻底删除（v0.3 回收站链路）
const softTarget = one('SELECT id FROM tasks WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
const visibleBefore = one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL');
db.prepare("UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?").run(softTarget);
const visibleAfter = one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL');
const trashed = one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NOT NULL');
if (visibleAfter !== visibleBefore - 1 || trashed !== 1) {
  console.error('✘ 软删除后可见/回收站条数不正确', { visibleBefore, visibleAfter, trashed });
  process.exit(1);
}
db.prepare('UPDATE tasks SET deleted_at = NULL WHERE id = ?').run(softTarget);
if (one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NOT NULL') !== 0) {
  console.error('✘ 恢复失败');
  process.exit(1);
}
db.prepare("UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?").run(softTarget);
db.prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL').run();
console.log('软删除/恢复/清空回收站演练: OK');

// 演练提醒标记（用一条仍然存在的任务）
const notifyTarget = one('SELECT id FROM tasks ORDER BY id LIMIT 1');
db.prepare("UPDATE tasks SET notified_at = datetime('now') WHERE id = ?").run(notifyTarget);
const notifiedAt = one(`SELECT notified_at FROM tasks WHERE id = ${notifyTarget}`);
db.prepare('UPDATE tasks SET notified_at = NULL WHERE id = ?').run(notifyTarget);
if (!notifiedAt) {
  console.error('✘ notified_at 写入失败');
  process.exit(1);
}
console.log('提醒标记演练: OK');

console.log('外键级联后未分类任务数:', one('SELECT COUNT(*) FROM tasks WHERE folder_id IS NULL'));

db.close();
console.log('\n迁移脚本校验通过 ✅');
