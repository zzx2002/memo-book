import type { DragEvent } from 'react';
import { folderHex, NO_FOLDER_COLOR, PRIORITY } from '../lib/constants';
import { fmtMD, todayISO } from '../lib/dates';
import { REPEAT_LABELS } from '../lib/repeat';
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
  dragging = false,
  dropTarget = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: TaskRowProps) {
  const { toggleDone, select, folderById } = useApp();
  const folder = folderById(task.folderId);
  const today = todayISO();

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
    selected ? 'active' : '',
    dragging ? 'dragging' : '',
    dropTarget ? 'drop-target' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      data-task={task.id}
      draggable={draggable}
      onClick={() => select(task.id)}
      onDoubleClick={() => toggleDone(task.id)}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer?.setData('text/plain', String(task.id));
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              onDragStart?.();
            }
          : undefined
      }
      onDragOver={
        draggable
          ? (e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              onDragOver?.(e);
            }
          : undefined
      }
      onDrop={
        draggable
          ? (e) => {
              e.preventDefault();
              onDrop?.();
            }
          : undefined
      }
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
    >
      {draggable ? (
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
          toggleDone(task.id);
        }}
      >
        <Icon name="check" size={11} />
      </button>

      <span
        className="h-2 w-2 flex-none rounded-full"
        style={{ background: task.done ? '#d4d7de' : PRIORITY[task.priority].color }}
      />

      <span className="title">{task.title}</span>

      <span className="tag">
        <span
          className="swatch h-[9px] w-[9px]"
          style={{ background: folder ? folderHex(folder.color) : NO_FOLDER_COLOR }}
        />
        <span className="truncate">{folder ? folder.name : '未分类'}</span>
      </span>

      <span className={`due${dueClass}`}>
        {task.repeat !== 'none' ? (
          <span className="inline-grid place-items-center text-ink-mute" title={REPEAT_LABELS[task.repeat]}>
            <Icon name="repeat" size={12} />
          </span>
        ) : null}
        {task.dueDate ? fmtMD(task.dueDate) : ''}
      </span>
    </div>
  );
}
