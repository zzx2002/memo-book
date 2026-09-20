import { useState } from 'react';
import { DESC_MAX, folderHex, NO_FOLDER_COLOR, PRIORITY, PRIORITY_ORDER } from '../lib/constants';
import { fmtDateTime, fmtFull, fmtMDW, fmtStamp, toDateInput, toDateTimeInput } from '../lib/dates';
import { useApp } from '../state/AppContext';
import type { Task } from '../types';
import { Icon, type IconName } from './Icon';

export function DetailPanel() {
  const { selectedTask } = useApp();

  if (!selectedTask) {
    return (
      <aside className="grid place-items-center bg-pane">
        <div className="px-10 text-center text-[13px] text-ink-mute">
          <div className="mb-1.5 text-[15px] text-ink-soft">选择一条待办查看详情</div>
          也可以直接在上方输入框新增
        </div>
      </aside>
    );
  }

  // key 保证切换任务时本地输入态重置
  return <DetailBody key={selectedTask.id} task={selectedTask} />;
}

function DetailBody({ task }: { task: Task }) {
  const { updateTask, toggleDone, removeTask, folders, folderById, select } = useApp();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note);
  const [remark, setRemark] = useState(task.remark);

  const folder = folderById(task.folderId);
  const priority = PRIORITY[task.priority];

  return (
    <aside className="flex min-w-0 flex-col bg-pane">
      <div className="flex items-center px-5 pb-1 pt-4">
        <button
          type="button"
          aria-label="切换完成状态"
          className={`check${task.done ? ' checked' : ''}`}
          onClick={() => toggleDone(task.id)}
        >
          <Icon name="check" size={11} />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="icon-btn"
          title="关闭详情"
          onClick={() => select(null)}
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-7 pt-1">
        <input
          className="detail-title"
          value={title}
          maxLength={140}
          placeholder="待办标题"
          style={task.done ? { textDecoration: 'line-through', color: '#9aa0ab' } : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            updateTask(task.id, { title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setTitle(task.title);
              updateTask(task.id, { title: task.title });
              e.currentTarget.blur();
            }
          }}
        />

        <div className="flex flex-wrap items-center gap-2.5 pb-[18px] pt-0.5">
          <span className="chip">
            <span
              className="swatch h-[9px] w-[9px]"
              style={{ background: folder ? folderHex(folder.color) : NO_FOLDER_COLOR }}
            />
            {folder ? folder.name : '未分类'}
          </span>
          {task.dueDate ? (
            <span className="chip">
              <span className="cal">
                <Icon name="cal" size={14} />
              </span>
              {fmtMDW(task.dueDate)}
            </span>
          ) : null}
          {task.remindAt ? (
            <span className="chip plain">
              <span className="clock">
                <Icon name="clock" size={14} />
              </span>
              <span className="chip-col">
                <span className="k">提醒</span>
                <span className="v">{fmtDateTime(task.remindAt)}</span>
              </span>
            </span>
          ) : null}
          <span className="chip">
            <span className="swatch h-[9px] w-[9px]" style={{ background: priority.color }} />
            {priority.label}优先级
          </span>
        </div>

        <div className="relative mb-[22px]">
          <textarea
            className="desc-box"
            value={note}
            maxLength={DESC_MAX}
            placeholder="补充说明、拆解步骤、参考链接 ..."
            onChange={(e) => {
              const next = e.target.value.slice(0, DESC_MAX);
              setNote(next);
              updateTask(task.id, { note: next });
            }}
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11.5px] text-ink-faint">
            {note.length} / {DESC_MAX}
          </span>
        </div>

        <div className="field-row">
          <span className="k">优先级</span>
          <div className="flex min-h-[38px] items-center gap-2">
            <div className="flex flex-1 gap-2">
              {PRIORITY_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  data-p={key}
                  className={`seg-btn${task.priority === key ? ' on' : ''}`}
                  onClick={() => updateTask(task.id, { priority: key })}
                >
                  <span
                    className="h-[9px] w-[9px] rounded-full"
                    style={{ background: PRIORITY[key].color }}
                  />
                  {PRIORITY[key].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field-row">
          <span className="k">所属文件夹</span>
          <div className="flex min-h-[38px] items-center gap-2">
            <div className="pick">
              <div className="box">
                <span
                  className="swatch h-3 w-3"
                  style={{ background: folder ? folderHex(folder.color) : NO_FOLDER_COLOR }}
                />
                <span className="flex-1 truncate">{folder ? folder.name : '未分类'}</span>
                <span className="grid place-items-center text-ink-mute">
                  <Icon name="chev" size={13} />
                </span>
              </div>
              <select
                value={task.folderId ?? ''}
                onChange={(e) =>
                  updateTask(task.id, { folderId: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">未分类</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DateField
          label="排期"
          icon="cal"
          type="date"
          value={task.startDate}
          display={task.startDate ? fmtFull(task.startDate) : '选择开始日期'}
          placeholder={!task.startDate}
          onChange={(value) => updateTask(task.id, { startDate: value })}
        />

        <DateField
          label="截止日期"
          icon="cal"
          type="date"
          value={task.dueDate}
          display={task.dueDate ? fmtFull(task.dueDate) : '选择截止日期'}
          placeholder={!task.dueDate}
          onChange={(value) => {
            const patch: Parameters<typeof updateTask>[1] = { dueDate: value };
            // 截止日期变化时，让提醒时间跟随同一天
            if (value && task.remindAt && task.remindAt.slice(0, 10) !== value.slice(0, 10)) {
              patch.remindAt = `${value}T${task.remindAt.slice(11, 16)}`;
            }
            updateTask(task.id, patch);
          }}
        />

        <DateField
          label="提醒"
          icon="clock"
          type="datetime-local"
          value={task.remindAt}
          display={task.remindAt ? fmtDateTime(task.remindAt) : '设置提醒时间'}
          placeholder={!task.remindAt}
          onChange={(value) => updateTask(task.id, { remindAt: value })}
        />

        <div className="pt-3.5">
          <textarea
            className="w-full resize-y rounded-[10px] border border-line bg-[#fcfcfd] px-3.5 py-3 text-[13.5px] leading-relaxed focus:border-[#d9e0fb] focus:bg-pane focus:ring-[3px] focus:ring-[#f0f3fe]"
            value={remark}
            placeholder="其他备注（可选）"
            onChange={(e) => {
              setRemark(e.target.value);
              updateTask(task.id, { remark: e.target.value });
            }}
          />
        </div>

        <div className="flex items-center gap-2.5 pb-1 pt-[18px]">
          <button
            type="button"
            className="danger-btn"
            onClick={() => {
              if (window.confirm(`删除「${task.title}」？`)) removeTask(task.id);
            }}
          >
            <Icon name="trash" size={14} />
            删除待办
          </button>
          <span className="ml-auto text-[11.5px] text-ink-faint">
            {task.done && task.completedAt
              ? `完成于 ${fmtStamp(task.completedAt)}`
              : `创建于 ${fmtStamp(task.createdAt)}`}
          </span>
        </div>
      </div>
    </aside>
  );
}

function DateField({
  label,
  icon,
  type,
  value,
  display,
  placeholder,
  onChange
}: {
  label: string;
  icon: IconName;
  type: 'date' | 'datetime-local';
  value: string | null;
  display: string;
  placeholder: boolean;
  onChange: (value: string | null) => void;
}) {
  const inputValue = type === 'date' ? toDateInput(value) : toDateTimeInput(value);
  return (
    <div className="field-row">
      <span className="k">{label}</span>
      <div className="flex min-h-[38px] items-center gap-2">
        <div className="date-field">
          <span className="grid flex-none place-items-center text-ink-soft">
            <Icon name={icon} size={14} />
          </span>
          <span className={`txt${placeholder ? ' ph' : ''}`}>{display}</span>
          <input
            type={type}
            value={inputValue}
            onChange={(e) => onChange(e.target.value ? e.target.value : null)}
          />
          <button type="button" className="clear" title="清除" onClick={() => onChange(null)}>
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
