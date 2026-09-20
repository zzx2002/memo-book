-- ============================================================
--  v0.2：手动排序 + 重复任务
-- ============================================================

-- 手动拖拽排序的位次（越小越靠前）
ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- 重复规则：none / daily / weekly / monthly
ALTER TABLE tasks ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT 'none';

-- 已有数据按原来自增顺序补齐位次
UPDATE tasks SET sort_order = id;

CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks (sort_order);

-- 让示例数据里能直观看到重复任务
UPDATE tasks SET repeat_rule = 'weekly' WHERE title = '复习英语单词';
UPDATE tasks SET repeat_rule = 'daily'  WHERE title = '整理桌面与文件';
