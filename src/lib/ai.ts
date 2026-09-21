import { isDesktop } from './repo';
import type { Priority, Task } from '../types';

/* ============================================================
   把会议记录整理成待办：prompt 构造、响应解析、判重
   纯函数为主，传输层可注入（测试时可替换为假实现）
   ============================================================ */

export const AI_MODEL = 'deepseek-flash';
export const AI_MAX_TOKENS = 8000;
export const AI_TEMPERATURE = 0.2;

export type Confidence = 'high' | 'medium' | 'low';

export interface TaskDraft {
  title: string;
  note: string;
  priority: Priority;
  folderName: string | null;
  dueDate: string | null;
  remindAt: string | null;
  sourceQuote: string;
  confidence: Confidence;
  /** 与已有待办重复（标题 + 截止日期一致），预览里默认不勾选 */
  duplicate?: boolean;
}

export interface IgnoredItem {
  text: string;
  reason: string;
}

export interface AiParseResult {
  tasks: TaskDraft[];
  ignored: IgnoredItem[];
}

export interface AiUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}

export interface AiChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  maxTokens: number;
  temperature: number;
}

export interface AiChatResult {
  content: string;
  usage: AiUsage;
}

/* ---------------- 传输层（可注入，便于测试与浏览器预览） ---------------- */

export interface AiTransport {
  /** 是否可用；浏览器预览下为 false */
  available: boolean;
  chat(request: AiChatRequest): Promise<AiChatResult>;
}

const desktopTransport: AiTransport = {
  available: true,
  async chat(request) {
    const { invoke } = await import('@tauri-apps/api/core');
    const response = await invoke<{
      content: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      cache_hit_tokens: number;
    }>('ai_chat', {
      request: {
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature
      }
    });
    return {
      content: response.content ?? '',
      usage: {
        model: response.model,
        promptTokens: response.prompt_tokens ?? 0,
        completionTokens: response.completion_tokens ?? 0,
        cacheHitTokens: response.cache_hit_tokens ?? 0
      }
    };
  }
};

const unavailableTransport: AiTransport = {
  available: false,
  async chat() {
    throw new Error('AI 整理仅在桌面端可用（浏览器预览无法安全保存 API Key）');
  }
};

let transport: AiTransport = isDesktop() ? desktopTransport : unavailableTransport;

export function setAiTransport(next: AiTransport): void {
  transport = next;
}

export function getAiTransport(): AiTransport {
  return transport;
}

/* ---------------- API Key 管理（桌面端走系统凭据管理器） ---------------- */

export interface AiKeyStatus {
  configured: boolean;
  hint: string;
}

export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  if (!isDesktop()) return { configured: false, hint: '' };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<AiKeyStatus>('ai_key_status');
  } catch {
    return { configured: false, hint: '' };
  }
}

export async function setAiKey(key: string): Promise<AiKeyStatus> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<AiKeyStatus>('ai_set_key', { key });
}

export async function clearAiKey(): Promise<void> {
  if (!isDesktop()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ai_clear_key');
}

/* ---------------- Prompt 构造 ---------------- */

export interface PromptContext {
  /** 今天，YYYY-MM-DD */
  today: string;
  /** 星期几，如 周五 */
  weekday: string;
  /** 已有文件夹名，模型只能从中选 */
  folders: string[];
}

export const DRAFT_SCHEMA_EXAMPLE = `{
  "tasks": [
    {
      "title": "完成项目方案初稿",
      "note": "基于用户调研结果，先出初稿再同步团队",
      "priority": "high",
      "folderName": "工作",
      "dueDate": "2026-09-25",
      "remindAt": null,
      "sourceQuote": "小李：方案初稿下周五前给我",
      "confidence": "high"
    }
  ],
  "ignored": [{ "text": "大家聊了下季度预算", "reason": "只是同步信息，没有行动项" }]
}`;

export function buildSystemPrompt(context: PromptContext): string {
  const folderList = context.folders.length ? context.folders.join('、') : '（暂无文件夹，请一律填 null）';
  return [
    '你是一个把会议记录整理成待办事项的助手。',
    `今天是 ${context.today}（${context.weekday}），时区为 Asia/Shanghai。`,
    '',
    '抽取规则：',
    '1. 只抽取原文中明确可执行的行动项；纯信息同步、讨论过程、别人已经做完的事都不要输出。',
    '2. 严禁编造日期。原文有明确时间（"下周五""9 月 25 日前"）时换算为 YYYY-MM-DD；',
    '   只有模糊表述（"尽快""近期""有空时"）时 dueDate 填 null，并把 confidence 降为 medium 或 low。',
    `3. folderName 只能从这个列表里选：${folderList}；判断不了就填 null，不要自造分类。`,
    '4. priority 判定：出现"必须/务必/紧急/尽快/今天/明天/截止"等强约束 → high；',
    '   有明确负责人或时间点 → medium；其余 → low。',
    '5. 每条都必须附 sourceQuote：逐字摘录原文中支撑该待办的片段（不超过 60 字），不得改写、不得拼凑。',
    '6. title 用动词开头的短句，不超过 30 字；note 补充背景，没有就填空字符串。',
    '7. 整理不出行动项时，tasks 返回空数组，并把原因写进 ignored。',
    '',
    '输出要求：只输出一个 JSON 对象，不要输出任何解释文字、不要用 markdown 代码块包裹。',
    'JSON 格式如下：',
    DRAFT_SCHEMA_EXAMPLE
  ].join('\n');
}

export function buildUserPrompt(text: string): string {
  return ['以下是会议记录原文，请整理成待办事项：', '', text.trim()].join('\n');
}

export function buildChatRequest(text: string, context: PromptContext): AiChatRequest {
  return {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt(context) },
      { role: 'user', content: buildUserPrompt(text) }
    ],
    maxTokens: AI_MAX_TOKENS,
    temperature: AI_TEMPERATURE
  };
}

/* ---------------- 响应解析 ---------------- */

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?$/;

/** 去掉 markdown 代码块包裹，并裁剪到最外层的 JSON 对象 */
export function extractJsonText(content: string): string {
  let text = String(content ?? '').trim();
  if (!text) return '';
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return text;
}

function normalizeDraft(raw: unknown): TaskDraft | null {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== 'object') return null;

  const title = String(item.title ?? '').trim().slice(0, 140);
  if (!title) return null;

  const priority = PRIORITIES.includes(item.priority as Priority) ? (item.priority as Priority) : 'low';
  const confidence = CONFIDENCES.includes(item.confidence as Confidence)
    ? (item.confidence as Confidence)
    : 'medium';

  const dueRaw = typeof item.dueDate === 'string' ? item.dueDate.trim() : '';
  const remindRaw = typeof item.remindAt === 'string' ? item.remindAt.trim() : '';
  const folderRaw = typeof item.folderName === 'string' ? item.folderName.trim() : '';

  return {
    title,
    note: typeof item.note === 'string' ? item.note.trim().slice(0, 1000) : '',
    priority,
    folderName: folderRaw && folderRaw !== 'null' ? folderRaw : null,
    dueDate: DATE_RE.test(dueRaw) ? dueRaw : null,
    remindAt: DATETIME_RE.test(remindRaw) ? remindRaw.replace(' ', 'T').slice(0, 16) : null,
    sourceQuote: typeof item.sourceQuote === 'string' ? item.sourceQuote.trim().slice(0, 120) : '',
    confidence
  };
}

/** 解析模型返回的 JSON；空内容或结构错误时抛出可读错误 */
export function parseAiContent(content: string): AiParseResult {
  const jsonText = extractJsonText(content);
  if (!jsonText) {
    // 官方文档明确说明 JSON 模式偶尔会返回空内容
    throw new Error('模型返回了空内容，请重试一次');
  }

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('模型返回的不是合法 JSON，请重试或换一段更短的文本');
  }

  const payload = data as { tasks?: unknown; ignored?: unknown };
  const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const tasks = rawTasks.map(normalizeDraft).filter((d): d is TaskDraft => d !== null);

  const ignored: IgnoredItem[] = Array.isArray(payload.ignored)
    ? payload.ignored
        .map((entry) => {
          const item = entry as Record<string, unknown> | null;
          if (!item || typeof item !== 'object') return null;
          const text = String(item.text ?? '').trim();
          if (!text) return null;
          return { text: text.slice(0, 120), reason: String(item.reason ?? '').trim().slice(0, 120) };
        })
        .filter((x): x is IgnoredItem => x !== null)
    : [];

  if (!tasks.length && !ignored.length) {
    throw new Error('模型没有整理出任何待办，换一段更完整的记录再试');
  }
  return { tasks, ignored };
}

/** 标记与已有待办重复的草稿（标题 + 截止日期一致） */
export function markDuplicates(drafts: TaskDraft[], existing: Task[]): TaskDraft[] {
  const seen = new Set(
    existing.map((t) => `${t.title.trim().toLowerCase()}|${t.dueDate ?? ''}`)
  );
  return drafts.map((draft) => ({
    ...draft,
    duplicate: seen.has(`${draft.title.trim().toLowerCase()}|${draft.dueDate ?? ''}`)
  }));
}

/** 粗略估算输入 token（中文约 1.5 字/token），仅用于成本提示 */
export function estimateTokens(text: string): number {
  return Math.ceil(String(text ?? '').length / 1.5);
}

/** 展示用的 token 用量文案 */
export function usageLabel(usage: AiUsage): string {
  const total = usage.promptTokens + usage.completionTokens;
  const cache = usage.cacheHitTokens ? `，其中 ${usage.cacheHitTokens} 命中缓存` : '';
  return `${usage.model} · 输入 ${usage.promptTokens} + 输出 ${usage.completionTokens} = ${total} tokens${cache}`;
}

/** 用一次极小的请求验证 Key 是否可用；成功返回用量文案 */
export async function testAiConnection(): Promise<string> {
  const result = await transport.chat({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: '你是连接测试助手，只输出 JSON，不要输出其他内容。' },
      { role: 'user', content: '请输出 {"ok":true}' }
    ],
    maxTokens: 50,
    temperature: 0
  });
  if (!extractJsonText(result.content)) throw new Error('返回内容为空');
  return usageLabel(result.usage);
}
