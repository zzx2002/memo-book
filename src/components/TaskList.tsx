import { useEffect, useRef, useState } from 'react';
import { SORTS, SORT_ORDER, SMART_VIEWS } from '../lib/constants';
import { moveTo } from '../lib/reorder';
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
    loadDemo,
    query,
    setQuery,
    searchInputRef,
    reorder,
    tasks,
    notify
  } = useApp();

  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const sortRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  // 拖拽源放在 ref 里：dragstart 与 drop 可能落在同一批渲染中，用 state 会读到旧值
  const dragIdRef = useRef<number | null>(null);

  const isDoneView = view.type === 'smart' && view.id === 'done';
  const manual = sort === 'manual';

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen, searchInputRef]);

  // 搜索框被快捷键唤起时同步展开
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (e.target === searchInputRef.current) setSearchOpen(true);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [searchInputRef]);

  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };

  const startDrag = (id: number) => {
    dragIdRef.current = id;
    setDragId(id);
  };

  const endDrag = () => {
    dragIdRef.current = null;
    setDragId(null);
    setOverId(null);
  };

  const dropOn = (targetId: number) => {
    const source = dragIdRef.current;
    endDrag();
    if (source == null || source === targetId) return;

    // 以“当前看到的顺序”为基准重排，这样即使原本是按截止日期/优先级排的，
    // 松手后也不会整列表跳动；其余任务保持原有相对次序排在后面。
    const visibleIds = activeTasks.map((t) => t.id);
    const nextVisible = moveTo(visibleIds, source, targetId);
    if (nextVisible === visibleIds) return;

    const rest = tasks
      .filter((t) => !nextVisible.includes(t.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((t) => t.id);

    reorder([...nextVisible, ...rest]);
    if (sort !== 'manual') {
      setSort('manual');
      notify('已切换为手动排序');
    }
  };

  const emptyText = (() => {
    if (query.trim()) return ['没有匹配的待办', `换个关键词，或清空搜索查看全部`] as const;
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
        <div className="min-w-0">
          <h2 className="mb-0.5 text-[21px] font-bold tracking-wide">{listTitle}</h2>
          <div className="truncate text-[12.5px] text-ink-mute">{listSub}</div>
        </div>
        <div className="ml-auto flex flex-none items-center gap-1 pt-1">
          {searchOpen ? (
            <div className="flex h-[30px] items-center gap-1.5 rounded-lg border border-line bg-pane px-2 focus-within:border-[#c9d3fb] focus-within:ring-[3px] focus-within:ring-[#eef1fe]">
              <Icon name="search" size={13} className="text-ink-mute" />
              <input
                ref={searchInputRef}
                value={query}
                placeholder="搜索标题 / 说明"
                className="w-[132px] border-none bg-transparent text-[12.5px]"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closeSearch();
                  }
                }}
              />
              {query ? (
                <button type="button" className="text-ink-mute hover:text-ink" onClick={() => setQuery('')}>
                  <Icon name="x" size={12} />
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="icon-btn"
              title="搜索（/ 或 Ctrl+K）"
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" size={15} />
            </button>
          )}

          <button ref={sortRef} type="button" className="ghost-btn" onClick={() => setSortOpen((v) => !v)}>
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

      <div className="px-[26px] pt-1">
        <AddInput />
      </div>

      <div className="px-[26px] pb-2 pt-2 text-[11.5px] text-ink-faint">
        {manual
          ? '拖拽左侧手柄调整顺序'
          : '拖拽左侧手柄即可调整顺序（会自动切换为手动排序） · / 搜索，N 新增'}
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
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={selectedId === task.id}
                  draggable
                  gripAlways={manual}
                  dragging={dragId === task.id}
                  dropTarget={overId === task.id && dragId !== task.id}
                  onDragStart={() => startDrag(task.id)}
                  onDragOver={() => setOverId(task.id)}
                  onDrop={() => dropOn(task.id)}
                  onDragEnd={endDrag}
                />
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
          {SMART_VIEWS.inbox.label} · 手动排序模式下可拖拽调整
        </div>
      </Dropdown>
    </section>
  );
}
