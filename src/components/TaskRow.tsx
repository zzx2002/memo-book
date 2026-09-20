import { folderHex, NO_FOLDER_COLOR, PRIORITY } from '../lib/constants';
import { fmtMD, todayISO } from '../lib/dates';
import { useApp } from '../state/AppContext';
import type { Task } from '../types';
import { Icon } from './Icon';

export function TaskRow({ task, selected }: { task: Task; selected: boolean }) {
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

  return (
    <div
      className={`task-row${task.done ? ' done' : ''}${selected ? ' active' : ''}`}
      onClick={() => select(task.id)}
      onDoubleClick={() => toggleDone(task.id)}
    >
      <button
        type="button"
        aria-label={task.done ? '标记为未完成' : '标记为已完成'}
        className={`check${task.done ? ' square' : ''}`}
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
        <span className="swatch h-[9px] w-[9px]" style={{ background: folder ? folderHex(folder.color) : NO_FOLDER_COLOR }} />
        <span className="truncate">{folder ? folder.name : '未分类'}</span>
      </span>

      <span className={`due${dueClass}`}>{task.dueDate ? fmtMD(task.dueDate) : ''}</span>
    </div>
  );
}
