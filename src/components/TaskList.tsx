import { useRef, useState } from 'react';
import { SORTS, SORT_ORDER, SMART_VIEWS } from '../lib/constants';
import { useApp } from '../state/AppContext';
import { AddInput } from './AddInput';
import { Dropdown, MenuItem } from './Dropdown';
import { Icon } from './Icon';
import { TaskRow } from './TaskRow';

export function TaskList() {
  const {
    listTitle,
    listSub,
    view,
    sort,
    setSort,
    activeTasks,
    doneTasks,
    showDone,
    setShowDone,
    selectedId,
    ready,
    clearCompleted,
    loadDemo
  } = useApp();

  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const sortRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const isDoneView = view.type === 'smart' && view.id === 'done';

  const emptyText = (() => {
    if (view.type === 'folder') return ['这个文件夹还是空的', '在上方输入框新增一条待办'] as const;
    switch (view.id) {
      case 'today':
        return ['今天没有待办', '好好休息，或者安排点新计划'] as const;
      case 'upcoming':
        return ['没有排期的待办', '给待办加上截止日期，就会出现在这里'] as const;
      case 'done':
        return ['还没有已完成的待办', '完成的待办会收在这里'] as const;
      default:
        return ['收件箱是空的', '在上方输入框写下第一件待办'] as const;
    }
  })();

  return (
    <section className="flex min-w-0 flex-col border-r border-line bg-pane">
      <header className="flex items-start gap-3 px-[26px] pb-3 pt-[22px]">
        <div>
          <h2 className="mb-0.5 text-[21px] font-bold tracking-wide">{listTitle}</h2>
          <div className="text-[12.5px] text-ink-mute">{listSub}</div>
        </div>
        <div className="ml-auto flex items-center gap-1 pt-1">
          <button
            ref={sortRef}
            type="button"
            className="ghost-btn"
            onClick={() => setSortOpen((v) => !v)}
          >
            <span>{SORTS[sort]}</span>
            <Icon name="chev" size={13} />
          </button>
          <button
            ref={moreRef}
            type="button"
            className="icon-btn"
            title="更多"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <Icon name="more" size={16} />
          </button>
        </div>
      </header>

      <div className="px-[26px] pb-3.5 pt-1">
        <AddInput />
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 pb-6">
        {!ready ? (
          <div className="empty-state">正在载入 …</div>
        ) : isDoneView ? (
          doneTasks.length ? (
            doneTasks.map((task) => (
              <TaskRow key={task.id} task={task} selected={selectedId === task.id} />
            ))
          ) : (
            <div className="empty-state">
              <div className="big">{emptyText[0]}</div>
              {emptyText[1]}
            </div>
          )
        ) : (
          <>
            {activeTasks.length ? (
              activeTasks.map((task) => (
                <TaskRow key={task.id} task={task} selected={selectedId === task.id} />
              ))
            ) : (
              <div className="empty-state">
                <div className="big">{emptyText[0]}</div>
                {emptyText[1]}
              </div>
            )}

            {doneTasks.length > 0 && (
              <>
                <div
                  className={`group-head${showDone ? '' : ' collapsed'}`}
                  onClick={() => setShowDone(!showDone)}
                >
                  <span className="chev">
                    <Icon name="chev" size={13} />
                  </span>
                  <span>已完成</span>
                  <span className="text-ink-faint">{doneTasks.length}</span>
                </div>
                {showDone &&
                  doneTasks.map((task) => (
                    <TaskRow key={task.id} task={task} selected={selectedId === task.id} />
                  ))}
              </>
            )}
          </>
        )}
      </div>

      <Dropdown open={sortOpen} anchorRef={sortRef} onClose={() => setSortOpen(false)}>
        {SORT_ORDER.map((key) => (
          <MenuItem
            key={key}
            on={sort === key}
            onClick={() => {
              setSort(key);
              setSortOpen(false);
            }}
          >
            {SORTS[key]}
          </MenuItem>
        ))}
      </Dropdown>

      <Dropdown open={moreOpen} anchorRef={moreRef} onClose={() => setMoreOpen(false)}>
        <MenuItem
          onClick={() => {
            setMoreOpen(false);
            clearCompleted();
          }}
        >
          清除已完成
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMoreOpen(false);
            loadDemo();
          }}
        >
          载入示例数据
        </MenuItem>
        <div className="mx-1.5 my-1 h-px bg-line" />
        <div className="px-2.5 py-1 text-[11.5px] leading-relaxed text-ink-faint">
          {SMART_VIEWS.inbox.label} · 快捷键：N 新增，1-4 切换视图
        </div>
      </Dropdown>
    </section>
  );
}
