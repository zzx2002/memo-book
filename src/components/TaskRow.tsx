import { useRef, type DragEvent } from 'react';
import { folderHex, NO_FOLDER_COLOR, PRIORITY } from '../lib/constants';
import { fmtMD, todayISO } from '../lib/dates';
import { REPEAT_LABELS } from '../lib/repeat';
import { rowDateLabel } from '../lib/views';
import { useApp } from '../state/AppContext';
import type { Task } from '../types';
import { Icon } from './Icon';

interface TaskRowProps {
  task: Task;
  selected: boolean;
  /** 允许拖拽调整顺序 */
  draggable?: boolean;
  /** 手动排序模式下常显手柄，其余模式 hover 才显示 */
  gripAlways?: boolean;
  /** 多选模式：点击整行切换勾选 */
  selectable?: boolean;
  checked?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}

export function TaskRow({
  task,
  selected,
  draggable = false,
  gripAlways = false,
  selectable = false,
  checked = false,
  dragging = false,
  dropTarget = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: TaskRowProps) {
  const {
    toggleDone,
    select,
    folderById,
    editingId,
    startEdit,
    commitEdit,
    cancelEdit,
    toggleSelected
  } = useApp();
  const folder = folderById(task.folderId);
  const today = todayISO();
  const cancelled = useRef(false);
  const editing = editingId === task.id;
  const dateInfo = rowDateLabel(task);

  const dueClass =
    !task.done && task.dueDate
      ? task.dueDate < today
        ? ' overdue'
        : task.dueDate === today
          ? ' today'
          : ''
      : '';

  const className = [
    'task-row',
    task.done ? 'done' : '',
    selected || checked ? 'active' : '',
    dragging ? 'dragging' : '',
    dropTarget ? 'drop-target' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const dragEnabled = draggable && !editing && !selectable;

  return (
    <div
      className={className}
      data-task={task.id}
      draggable={dragEnabled}
      onClick={() => (selectable ? toggleSelected(task.id) : select(task.id))}
      // 双击进入内联重命名（标记完成请用左侧勾选框，避免误触）
      onDoubleClick={() => {
        if (!selectable && !task.done) startEdit(task.id);
      }}
      onDragStart={
        dragEnabled
          ? (e) => {
              e.dataTransfer?.setData('text/plain', String(task.id));
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              onDragStart?.();
            }
          : undefined
      }
      onDragOver={
        dragEnabled
          ? (e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              onDragOver?.(e);
            }
          : undefined
      }
      onDrop={
        dragEnabled
          ? (e) => {
              e.preventDefault();
              onDrop?.();
            }
          : undefined
      }
      onDragEnd={dragEnabled ? () => onDragEnd?.() : undefined}
    >
      {selectable ? (
        <span
          role="checkbox"
          aria-checked={checked}
          aria-label="选择这条待办"
          className={`check rounded-[5px]${checked ? ' checked !border-accent !bg-accent' : ''}`}
        >
          <Icon name="check" size={11} />
        </span>
      ) : draggable ? (
        <span className={`grip${gripAlways ? ' always' : ''}`} title="拖拽调整顺序">
          <Icon name="grip" size={13} />
        </span>
      ) : null}

      <button
        type="button"
        aria-label={task.done ? '标记为未完成' : '标记为已完成'}
        className={`check${task.done ? ' square' : ''}`}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (selectable) {
            toggleSelected(task.id);
            return;
          }
          toggleDone(task.id);
        }}
      >
        <Icon name="check" size={11} />
      </button>

      <span
        className="h-2 w-2 flex-none rounded-full"
        style={{ background: task.done ? '#d4d7de' : PRIORITY[task.priority].color }}
      />

      {editing ? (
        <input
          className="min-w-0 flex-1 rounded-md border border-accent bg-pane px-1.5 py-0.5 text-[14px]"
          defaultValue={task.title}
          maxLength={140}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit(task.id, e.currentTarget.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelled.current = true;
              cancelEdit();
            }
          }}
          onBlur={(e) => {
            if (cancelled.current) {
              cancelled.current = false;
              return;
            }
            commitEdit(task.id, e.target.value);
          }}
        />
      ) : (
        <span className="title">{task.title}</span>
      )}

      <span className="tag">
        <span
          className="swatch h-[9px] w-[9px]"
          style={{ background: folder ? folderHex(folder.color) : NO_FOLDER_COLOR }}
        />
        <span className="truncate">{folder ? folder.name : '未分类'}</span>
      </span>

      <span
        className={`due${dueClass}${dateInfo.kind === 'start' ? ' w-[108px] text-ink-mute' : ''}`}
        title={dateInfo.kind === 'start' ? '排期开始日期' : undefined}
      >
        {task.repeat !== 'none' ? (
          <span className="inline-grid place-items-center text-ink-mute" title={REPEAT_LABELS[task.repeat]}>
            <Icon name="repeat" size={12} />
          </span>
        ) : null}
        {dateInfo.kind === 'due'
          ? fmtMD(dateInfo.text)
          : dateInfo.kind === 'start'
            ? `开始 ${fmtMD(dateInfo.text)}`
            : ''}
      </span>
    </div>
  );
}
