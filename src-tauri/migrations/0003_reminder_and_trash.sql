-- ============================================================
--  v0.3：提醒通知记录 + 软删除（回收站）
-- ============================================================

-- 已提醒时间：避免同一条提醒重复弹出
ALTER TABLE tasks ADD COLUMN notified_at TEXT;

-- 软删除时间：非 NULL 表示在回收站里
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks (deleted_at);
