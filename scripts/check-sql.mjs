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
console.log('首条说明长度:', one('SELECT LENGTH(note) FROM tasks WHERE title = \'完成项目方案初稿\''));

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
console.log('外键级联后未分类任务数:', one('SELECT COUNT(*) FROM tasks WHERE folder_id IS NULL'));

db.close();
console.log('\n迁移脚本校验通过 ✅');
