// 只读检查用户数据库：迁移状态、表结构、数据量（不修改任何内容）
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dbPath = join(process.env.APPDATA, 'com.memobook.desktop', 'memo.db');
if (!existsSync(dbPath)) {
  console.log('数据库不存在:', dbPath);
  process.exit(0);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const one = (sql) => Object.values(db.prepare(sql).get() ?? {})[0];

console.log('数据库:', dbPath);
console.log('大小   :', (await import('node:fs')).statSync(dbPath).size, 'bytes');

console.log('\n--- 已应用的迁移 ---');
try {
  const rows = db.prepare('SELECT version, description, success FROM _sqlx_migrations ORDER BY version').all();
  for (const r of rows) console.log(`  v${r.version}  success=${r.success}  ${r.description}`);
} catch (e) {
  console.log('  读取迁移表失败:', e.message);
}

console.log('\n--- tasks 表结构 ---');
const cols = db.prepare("SELECT name, type FROM pragma_table_info('tasks')").all();
console.log('  ' + cols.map((c) => c.name).join(', '));

console.log('\n--- 数据量 ---');
console.log('  未删除待办:', one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL'));
console.log('  回收站    :', one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NOT NULL'));
console.log('  已完成    :', one('SELECT COUNT(*) FROM tasks WHERE done = 1 AND deleted_at IS NULL'));
console.log('  文件夹    :', one('SELECT COUNT(*) FROM folders'));
console.log('  最近创建  :', one('SELECT MAX(created_at) FROM tasks'));
console.log('  排期非空  :', one('SELECT COUNT(*) FROM tasks WHERE start_date IS NOT NULL AND deleted_at IS NULL'));
console.log('  截止非空  :', one('SELECT COUNT(*) FROM tasks WHERE due_date IS NOT NULL AND deleted_at IS NULL'));

// 按应用的视图规则预测「今天 / 即将到来」条数（与 src/lib/views.ts 保持一致）
const today = one("SELECT date('now', 'localtime')");
const todayCond = `deleted_at IS NULL AND done = 0 AND (
  (due_date IS NOT NULL AND due_date <= '${today}') OR
  (start_date IS NOT NULL AND start_date <= '${today}')
)`;
console.log('\n--- 视图归属（今天 = ' + today + '）---');
console.log('  今天      :', one(`SELECT COUNT(*) FROM tasks WHERE ${todayCond}`));
console.log(
  '  即将到来  :',
  one(
    `SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND done = 0 AND NOT (${todayCond}) AND (
       (due_date IS NOT NULL AND due_date > '${today}') OR (start_date IS NOT NULL AND start_date > '${today}'))`
  )
);
console.log(
  '  两个日期都空:',
  one('SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND done = 0 AND start_date IS NULL AND due_date IS NULL')
);

db.close();
