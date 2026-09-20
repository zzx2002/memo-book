import { useEffect, useRef, useState } from 'react';
import { folderHex, SMART_ORDER, SMART_VIEWS } from '../lib/constants';
import { useApp } from '../state/AppContext';
import type { IconName } from '../components/Icon';
import { Icon } from '../components/Icon';

const VIEW_ICON: Record<string, IconName> = {
  inbox: 'inbox',
  today: 'today',
  upcoming: 'upcoming',
  done: 'done'
};

export function Sidebar() {
  const {
    counts,
    view,
    setView,
    folders,
    addFolder,
    removeFolder,
    nextFolderColor,
    focusAddInput
  } = useApp();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commit = () => {
    const value = name.trim();
    setName('');
    setAdding(false);
    if (value) void addFolder(value, nextFolderColor);
  };

  return (
    <aside className="flex flex-col overflow-hidden border-r border-line bg-side px-3.5 pb-3.5 pt-[18px]">
      <div className="flex items-center gap-2.5 px-1.5 pb-4">
        <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-[#2b3040] text-white">
          <Icon name="brand" size={18} />
        </div>
        <h1 className="text-[16px] font-bold tracking-wide">我的记事簿</h1>
      </div>

      <nav className="flex flex-col gap-0.5">
        {SMART_ORDER.map((id) => {
          const on = view.type === 'smart' && view.id === id;
          return (
            <button
              key={id}
              type="button"
              className={`nav-item${on ? ' active' : ''}`}
              onClick={() => setView({ type: 'smart', id })}
            >
              <span className="ic">
                <Icon name={VIEW_ICON[id]} size={17} />
              </span>
              <span className="label">{SMART_VIEWS[id].label}</span>
              <span className="count">{counts[id]}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-1.5 my-3.5 h-px bg-line" />

      <div className="side-head">
        <span>文件夹</span>
        <button type="button" title="新增文件夹" onClick={() => setAdding(true)}>
          <Icon name="plus" size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 overflow-y-auto">
        {folders.map((folder) => {
          const on = view.type === 'folder' && view.id === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              className={`folder-item group${on ? ' active' : ''}`}
              onClick={() => setView({ type: 'folder', id: folder.id })}
            >
              <span className="swatch h-[9px] w-[9px]" style={{ background: folderHex(folder.color) }} />
              <span className="label">{folder.name}</span>
              <span className="count">{counts.folders[folder.id] ?? 0}</span>
              <span
                role="button"
                title="删除文件夹"
                className="del"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFolder(folder.id);
                }}
              >
                <Icon name="x" size={12} />
              </span>
            </button>
          );
        })}
      </div>

      {adding ? (
        <div className="px-2.5 pt-1">
          <input
            ref={inputRef}
            value={name}
            maxLength={12}
            placeholder="文件夹名称，回车确认"
            className="h-8 w-full rounded-lg border border-accent bg-pane px-2.5 text-[13px]"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setName('');
                setAdding(false);
              }
            }}
            onBlur={commit}
          />
        </div>
      ) : null}

      <div className="mt-auto pt-3">
        <button type="button" className="btn-add" onClick={focusAddInput}>
          <Icon name="plus" size={15} />
          新增待办
        </button>
      </div>
    </aside>
  );
}
