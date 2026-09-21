import { useMemo, useState } from 'react';
import {
  buildChatRequest,
  estimateTokens,
  getAiTransport,
  markDuplicates,
  parseAiContent,
  usageLabel,
  type AiUsage,
  type IgnoredItem,
  type TaskDraft
} from '../lib/ai';
import { PRIORITY, PRIORITY_ORDER } from '../lib/constants';
import { todayISO } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { Icon } from './Icon';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type Phase = 'input' | 'running' | 'preview' | 'error';

export function AiImportDialog() {
  const { aiOpen, closeAi, folders, tasks, importDrafts, notify } = useApp();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [ignored, setIgnored] = useState<IgnoredItem[]>([]);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [picked, setPicked] = useState<number[]>([]);

  const transport = getAiTransport();
  const estimated = useMemo(() => estimateTokens(text), [text]);

  if (!aiOpen) return null;

  const runExtract = async () => {
    const value = text.trim();
    if (!value) {
      notify('先把会议记录粘进来');
      return;
    }
    setPhase('running');
    setError('');
    try {
      const today = todayISO();
      const weekday = WEEKDAYS[new Date().getDay()];
      const request = buildChatRequest(value, {
        today,
        weekday,
        folders: folders.map((f) => f.name)
      });
      const result = await transport.chat(request);
      const parsed = parseAiContent(result.content);
      const marked = markDuplicates(parsed.tasks, tasks);
      setDrafts(marked);
      setIgnored(parsed.ignored);
      setUsage(result.usage);
      // 重复的默认不勾选
      setPicked(marked.map((d, i) => (d.duplicate ? -1 : i)).filter((i) => i >= 0));
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const updateDraft = (index: number, patch: Partial<TaskDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const togglePick = (index: number) => {
    setPicked((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  };

  const doImport = () => {
    const selected = picked
      .slice()
      .sort((a, b) => a - b)
      .map((i) => drafts[i])
      .filter((d): d is TaskDraft => !!d && !!d.title.trim());
    if (!selected.length) {
      notify('还没有勾选任何待办');
      return;
    }
    importDrafts(selected);
    setText('');
    setDrafts([]);
    setIgnored([]);
    setUsage(null);
    setPicked([]);
    setPhase('input');
  };

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(16,24,40,.28)] p-6"
      onClick={phase === 'running' ? undefined : closeAi}
    >
      <div
        className="flex max-h-[86vh] w-[760px] flex-col overflow-hidden rounded-2xl border border-line bg-pane shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-line px-6 py-3.5">
          <h2 className="text-[17px] font-bold tracking-wide">AI 整理会议记录</h2>
          <span className="text-[11.5px] text-ink-faint">
            {transport.available ? '由 DeepSeek 抽取行动项，确认后写入收件箱' : '仅桌面端可用'}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="icon-btn"
            title="关闭"
            disabled={phase === 'running'}
            onClick={closeAi}
          >
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {phase === 'input' || phase === 'error' ? (
            <>
              <div className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-soft">
                <span>粘贴会议记录 / 文字稿</span>
                <span className="text-ink-faint">
                  约 {estimated} tokens
                  {estimated > 60000 ? '（偏长，建议只粘与待办相关的段落）' : ''}
                </span>
              </div>
              <textarea
                className="h-[280px] w-full resize-y rounded-[10px] border border-line bg-[#fcfcfd] px-3.5 py-3 text-[13.5px] leading-relaxed focus:border-[#d9e0fb] focus:bg-pane focus:ring-[3px] focus:ring-[#f0f3fe]"
                placeholder="把会议记录粘到这里，例如：&#10;小李：方案初稿下周五前给我，这是本周最要紧的事。&#10;小王：我这边周四约一下体检。&#10;大家同步了下季度预算，暂时没有动作。"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
                内容会发送到 DeepSeek 服务器用于整理；模型只会抽取原文明确提到的行动项，
                每条都会附上原文出处供你核对。
              </div>
            </>
          ) : null}

          {phase === 'running' ? (
            <div className="grid h-[300px] place-items-center text-[13px] text-ink-mute">
              <div className="text-center">
                <div className="mb-2 text-[15px] text-ink-soft">正在整理…</div>
                已发送 {estimated} tokens 的文本，通常需要几秒到十几秒
              </div>
            </div>
          ) : null}

          {phase === 'preview' ? (
            <>
              <div className="mb-3 flex items-center gap-3 text-[12.5px] text-ink-soft">
                <span>
                  整理出 <b>{drafts.length}</b> 条待办，已勾选 <b>{picked.length}</b> 条
                </span>
                {usage ? <span className="text-ink-faint">{usageLabel(usage)}</span> : null}
              </div>

              <div className="space-y-2">
                {drafts.map((draft, index) => {
                  const on = picked.includes(index);
                  const folder = folders.find((f) => f.name === draft.folderName);
                  return (
                    <div
                      key={index}
                      className={`rounded-xl border px-3 py-2.5 ${
                        on ? 'border-[#cadcfb] bg-[#f7f9ff]' : 'border-line bg-pane'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          aria-label="选择这条"
                          aria-checked={on}
                          role="checkbox"
                          className={`check mt-0.5 rounded-[5px]${on ? ' checked !border-accent !bg-accent' : ''}`}
                          onClick={() => togglePick(index)}
                        >
                          <Icon name="check" size={11} />
                        </button>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <input
                            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-semibold hover:border-line focus:border-accent focus:bg-pane"
                            value={draft.title}
                            maxLength={140}
                            onChange={(e) => updateDraft(index, { title: e.target.value })}
                          />

                          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                            <select
                              className="rounded-md border border-line bg-pane px-1.5 py-0.5 text-[11.5px]"
                              value={draft.priority}
                              onChange={(e) =>
                                updateDraft(index, { priority: e.target.value as TaskDraft['priority'] })
                              }
                            >
                              {PRIORITY_ORDER.map((p) => (
                                <option key={p} value={p}>
                                  {PRIORITY[p].label}优先级
                                </option>
                              ))}
                            </select>

                            <select
                              className="rounded-md border border-line bg-pane px-1.5 py-0.5 text-[11.5px]"
                              value={draft.folderName ?? ''}
                              onChange={(e) =>
                                updateDraft(index, { folderName: e.target.value || null })
                              }
                            >
                              <option value="">未分类</option>
                              {folders.map((f) => (
                                <option key={f.id} value={f.name}>
                                  {f.name}
                                </option>
                              ))}
                            </select>

                            <input
                              type="date"
                              className="rounded-md border border-line bg-pane px-1.5 py-0.5 text-[11.5px]"
                              value={draft.dueDate ?? ''}
                              onChange={(e) => updateDraft(index, { dueDate: e.target.value || null })}
                            />

                            {draft.confidence !== 'high' ? (
                              <span
                                className="rounded-md bg-[#fdf7ec] px-1.5 py-0.5 text-[#c47c05]"
                                title="模型对这条的把握不大，建议核对原文"
                              >
                                {draft.confidence === 'low' ? '把握较低' : '待确认'}
                              </span>
                            ) : null}
                            {draft.duplicate ? (
                              <span className="rounded-md bg-[#f1f2f5] px-1.5 py-0.5 text-ink-mute">
                                可能重复
                              </span>
                            ) : null}
                            {folder ? null : draft.folderName ? (
                              <span className="rounded-md bg-[#fdf1f0] px-1.5 py-0.5 text-hi">
                                文件夹不存在
                              </span>
                            ) : null}
                          </div>

                          {draft.sourceQuote ? (
                            <div className="border-l-2 border-line pl-2 text-[11.5px] leading-relaxed text-ink-mute">
                              原文：{draft.sourceQuote}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {ignored.length ? (
                <details className="mt-3 rounded-xl border border-line bg-[#fcfcfd] px-3 py-2">
                  <summary className="cursor-pointer text-[12px] text-ink-mute">
                    模型跳过了 {ignored.length} 段内容（点击查看原因）
                  </summary>
                  <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-ink-faint">
                    {ignored.map((item, i) => (
                      <li key={i}>· {item.text} —— {item.reason}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}

          {phase === 'error' ? (
            <div className="mt-3 rounded-xl border border-[#f6c9c5] bg-[#fdf1f0] px-3 py-2.5 text-[12.5px] text-hi">
              整理失败：{error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-6 py-3">
          {phase === 'preview' ? (
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setPicked(drafts.map((_, i) => i))}
              >
                全选
              </button>
              <button type="button" className="ghost-btn" onClick={() => setPicked([])}>
                全不选
              </button>
            </>
          ) : null}
          <span className="flex-1" />
          {phase === 'preview' ? (
            <>
              <button type="button" className="ghost-btn" onClick={() => setPhase('input')}>
                返回修改
              </button>
              <button
                type="button"
                className="ghost-btn !bg-accent-bg !text-accent-ink"
                onClick={doImport}
              >
                导入 {picked.length} 条
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ghost-btn !bg-accent-bg !text-accent-ink"
              disabled={phase === 'running' || !transport.available}
              onClick={() => void runExtract()}
            >
              {phase === 'running' ? '整理中…' : '开始整理'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
