-- ============================================================
--  我的记事簿 · 初始表结构 + 示例数据
--  由 tauri-plugin-sql 在应用首次启动时执行（仅执行一次）
-- ============================================================

PRAGMA foreign_keys = ON;

-- 文件夹分类
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT 'blue',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 待办
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  note         TEXT    NOT NULL DEFAULT '',
  remark       TEXT    NOT NULL DEFAULT '',
  done         INTEGER NOT NULL DEFAULT 0,
  priority     TEXT    NOT NULL DEFAULT 'low' CHECK (priority IN ('high', 'medium', 'low')),
  folder_id    INTEGER REFERENCES folders (id) ON DELETE SET NULL,
  start_date   TEXT,
  due_date     TEXT,
  remind_at    TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_done     ON tasks (done);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_folder   ON tasks (folder_id);

-- 预留的键值表（主题、窗口状态等后续设置项）
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ------------------------------------------------------------
-- 初始文件夹
-- ------------------------------------------------------------
INSERT INTO folders (id, name, color, sort_order) VALUES
  (1, '工作', 'orange', 0),
  (2, '生活', 'green',  1),
  (3, '学习', 'blue',   2);

-- ------------------------------------------------------------
-- 示例待办（日期相对“今天”生成，方便直观看到今天 / 即将到来）
-- ------------------------------------------------------------
INSERT INTO tasks (title, note, remark, done, priority, folder_id, start_date, due_date, remind_at, created_at, completed_at) VALUES
  ('完成项目方案初稿',
   '基于用户调研结果，完成项目方案初稿。' || char(10) || '重点包括：' || char(10) || '1. 目标与背景' || char(10) || '2. 方案设计' || char(10) || '3. 预期效果' || char(10) || char(10) || '下一周一与团队同步讨论。',
   '', 0, 'high', 1, date('now', '-2 day'), date('now'), date('now') || 'T09:00', datetime('now', '-6 day'), NULL),
  ('预约年度体检',   '', '', 0, 'medium', 2, date('now'),         date('now', '+1 day'), NULL, datetime('now', '-5 day'), NULL),
  ('阅读《高效能人士的七个习惯》', '', '', 0, 'medium', 3, NULL,  date('now', '+3 day'), NULL, datetime('now', '-5 day'), NULL),
  ('整理桌面与文件', '', '', 0, 'low',    2, NULL,               date('now'),           NULL, datetime('now', '-4 day'), NULL),
  ('准备下周会议材料', '', '', 0, 'high',  1, NULL,              date('now', '-1 day'), NULL, datetime('now', '-4 day'), NULL),
  ('购买生日礼物',   '', '', 0, 'medium', 2, NULL,               date('now', '+2 day'), NULL, datetime('now', '-3 day'), NULL),
  ('复习英语单词',   '', '', 0, 'low',    3, NULL,               date('now', '+6 day'), NULL, datetime('now', '-3 day'), NULL),
  ('制定 5 月健身计划', '', '', 0, 'low', 2, NULL,               date('now', '+7 day'), NULL, datetime('now', '-2 day'), NULL),
  ('提交上周工作总结', '', '', 1, 'medium', 1, NULL,              date('now', '-3 day'), NULL, datetime('now', '-7 day'), datetime('now', '-3 day')),
  ('清理邮箱',       '', '', 1, 'low',    1, NULL,               date('now', '-4 day'), NULL, datetime('now', '-8 day'), datetime('now', '-4 day')),
  ('看完《人类简史》第三章', '', '', 1, 'low', 3, NULL,          date('now', '-5 day'), NULL, datetime('now', '-9 day'), datetime('now', '-5 day')),
  ('整理上周会议纪要', '', '', 1, 'low',  1, NULL,               date('now', '-2 day'), NULL, datetime('now', '-6 day'), datetime('now', '-2 day')),
  ('缴纳水电费',     '', '', 1, 'low',    2, NULL,               date('now', '-1 day'), NULL, datetime('now', '-5 day'), datetime('now', '-1 day'));
