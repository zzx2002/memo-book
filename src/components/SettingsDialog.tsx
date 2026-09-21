import { useEffect, useState, type ReactNode } from 'react';
import {
  getDataPaths,
  isAutostartEnabled,
  listBackups,
  openDataDir,
  setAutostart,
  type DataPaths
} from '../lib/desktop';
import { AUTO_BACKUP_OPTIONS, TRASH_RETENTION_OPTIONS } from '../lib/settings';
import {
  clearAiKey,
  getAiKeyStatus,
  setAiKey,
  testAiConnection,
  type AiKeyStatus
} from '../lib/ai';
import { formatReleaseDate } from '../lib/updates';
import { APP_VERSION } from '../lib/version';
import { useApp } from '../state/AppContext';
import { Icon } from './Icon';

export function SettingsDialog() {
  const { settingsOpen, closeSettings, settings, updateSettings, runBackup, storage, notify } = useApp();
  const {
    updateStatus,
    updateInfo,
    updateError,
    checkForUpdates,
    openReleasePage
  } = useApp();
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [paths, setPaths] = useState<DataPaths | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [keyStatus, setKeyStatus] = useState<AiKeyStatus>({ configured: false, hint: '' });
  const [keyInput, setKeyInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  useEffect(() => {
    if (!settingsOpen) return;
    let alive = true;
    void isAutostartEnabled().then((value) => alive && setAutostartState(value));
    void getDataPaths().then((value) => alive && setPaths(value));
    void listBackups().then((value) => alive && setBackups(value));
    void getAiKeyStatus().then((value) => alive && setKeyStatus(value));
    return () => {
      alive = false;
    };
  }, [settingsOpen]);

  if (!settingsOpen) return null;

  const desktop = storage === 'sqlite';

  const toggleAutostart = async () => {
    if (autostart == null) return;
    setBusy(true);
    const next = await setAutostart(!autostart);
    setBusy(false);
    if (next == null) {
      notify('切换开机自启失败');
      return;
    }
    setAutostartState(next);
    notify(next ? '已开启开机自启' : '已关闭开机自启');
  };

  const doBackup = async () => {
    setBusy(true);
    await runBackup();
    setBackups(await listBackups());
    setBusy(false);
  };

  const saveKey = async () => {
    const value = keyInput.trim();
    if (!value) return;
    setAiBusy(true);
    setAiMessage('');
    try {
      const status = await setAiKey(value);
      setKeyStatus(status);
      setKeyInput('');
      setAiMessage('已保存到系统凭据管理器');
    } catch (e) {
      setAiMessage('保存失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAiBusy(false);
    }
  };

  const dropKey = async () => {
    setAiBusy(true);
    setAiMessage('');
    try {
      await clearAiKey();
      setKeyStatus({ configured: false, hint: '' });
      setAiMessage('已清除');
    } catch (e) {
      setAiMessage('清除失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAiBusy(false);
    }
  };

  const testKey = async () => {
    setAiBusy(true);
    setAiMessage('测试中…');
    try {
      const usage = await testAiConnection();
      setAiMessage('连接正常 · ' + usage);
    } catch (e) {
      setAiMessage('连接失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(16,24,40,.28)] p-6"
      onClick={closeSettings}
    >
      <div
        className="max-h-[82vh] w-[540px] overflow-y-auto rounded-2xl border border-line bg-pane p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center">
          <h2 className="text-[17px] font-bold tracking-wide">设置</h2>
          <span className="flex-1" />
          <button type="button" className="icon-btn" title="关闭" onClick={closeSettings}>
            <Icon name="x" size={14} />
          </button>
        </header>

        <Row label="开机自启" hint={desktop ? '登录 Windows 后自动启动并收进托盘，提醒不会漏' : '浏览器预览模式不支持'}>
          <button
            type="button"
            disabled={autostart == null || busy}
            onClick={() => void toggleAutostart()}
            className={`relative h-[26px] w-[46px] rounded-full transition-colors ${
              autostart ? 'bg-accent' : 'bg-[#d5d8e0]'
            } ${autostart == null ? 'cursor-not-allowed opacity-50' : ''}`}
            aria-label="开机自启"
          >
            <span
              className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${
                autostart ? 'left-[23px]' : 'left-[3px]'
              }`}
            />
          </button>
        </Row>

        <Row label="自动备份" hint="启动时若距上次备份超过间隔，自动写一份 JSON 到数据目录（滚动保留 7 份）">
          <div className="flex gap-2">
            {AUTO_BACKUP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-b={option.value}
                className={`seg-btn${settings.autoBackup === option.value ? ' on' : ''}`}
                onClick={() => updateSettings({ autoBackup: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Row>

        <Row label="回收站保留" hint="超期的软删除记录会在启动时清理，避免数据库无限膨胀">
          <div className="flex gap-2">
            {TRASH_RETENTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-r={option.value}
                className={`seg-btn${settings.trashRetentionDays === option.value ? ' on' : ''}`}
                onClick={() => updateSettings({ trashRetentionDays: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Row>

        <Row
          label="数据位置"
          hint={desktop ? undefined : '浏览器预览模式下数据存在 localStorage，不产生文件'}
        >
          <div className="space-y-2">
            <PathLine label="数据库" value={paths?.database ?? (desktop ? '读取中…' : '—')} />
            <PathLine label="备份目录" value={paths?.backups ?? (desktop ? '读取中…' : '—')} />
            <div className="flex gap-2 pt-0.5">
              <button
                type="button"
                className="ghost-btn"
                disabled={!desktop}
                onClick={() => void openDataDir()}
              >
                打开数据目录
              </button>
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => void doBackup()}>
                立即备份
              </button>
            </div>
            {backups.length ? (
              <div className="pt-1 text-[11.5px] leading-relaxed text-ink-faint">
                最近备份：
                {backups.slice(0, 3).map((name) => (
                  <span key={name} className="mr-2 inline-block">
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Row>

        <Row label="更新" hint="检查 GitHub 上的最新版本；发现新版本会提示并跳转到下载页（不自动安装）">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-ink-soft">当前版本 v{APP_VERSION}</span>
              <button
                type="button"
                className="ghost-btn"
                disabled={updateStatus === 'checking'}
                onClick={() => void checkForUpdates(false)}
              >
                {updateStatus === 'checking' ? '检查中…' : '检查更新'}
              </button>
              {updateStatus === 'available' ? (
                <button
                  type="button"
                  className="ghost-btn !bg-accent-bg !text-accent-ink"
                  onClick={() => void openReleasePage()}
                >
                  前往下载
                </button>
              ) : null}
            </div>

            {updateStatus === 'latest' ? (
              <div className="text-[11.5px] text-ink-faint">已是最新版本</div>
            ) : null}

            {updateStatus === 'available' && updateInfo ? (
              <div className="rounded-lg border border-[#cadcfb] bg-[#f1f6fe] px-3 py-2 text-[12px] leading-relaxed text-accent-ink">
                发现新版本 <b>v{updateInfo.version}</b>
                {formatReleaseDate(updateInfo) ? ` · ${formatReleaseDate(updateInfo)}` : ''}
                {updateInfo.notes ? (
                  <div className="mt-1 max-h-[92px] overflow-y-auto whitespace-pre-wrap text-[11.5px] text-ink-soft">
                    {updateInfo.notes.slice(0, 400)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {updateStatus === 'error' && updateError ? (
              <div className="text-[11.5px] text-hi">
                检查失败：{updateError}
                <button
                  type="button"
                  className="ml-1 underline"
                  onClick={() => void openReleasePage()}
                >
                  手动打开下载页
                </button>
              </div>
            ) : null}
          </div>
        </Row>

        <Row
          label="AI 整理"
          hint={
            desktop
              ? '把会议记录交给 DeepSeek 抽取待办。API Key 存在 Windows 凭据管理器，不写配置文件、前端也读不到；整理时会议文本会发送到 DeepSeek 服务器。'
              : '浏览器预览模式无法安全保存 API Key，请在桌面端配置'
          }
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className={keyStatus.configured ? 'text-ink-soft' : 'text-ink-mute'}>
                {keyStatus.configured ? `已配置：${keyStatus.hint}` : '未配置'}
              </span>
              {keyStatus.configured ? (
                <>
                  <button type="button" className="ghost-btn" disabled={aiBusy} onClick={() => void testKey()}>
                    测试连接
                  </button>
                  <button
                    type="button"
                    className="ghost-btn hover:!bg-[#fdf1f0] hover:!text-hi"
                    disabled={aiBusy}
                    onClick={() => void dropKey()}
                  >
                    清除
                  </button>
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-pane px-2.5 text-[12.5px] focus:border-[#c9d3fb] focus:ring-[3px] focus:ring-[#eef1fe]"
                placeholder="粘贴 DeepSeek API Key（sk-…）"
                value={keyInput}
                disabled={!desktop || aiBusy}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button
                type="button"
                className="ghost-btn"
                disabled={!desktop || aiBusy || !keyInput.trim()}
                onClick={() => void saveKey()}
              >
                保存
              </button>
            </div>

            {aiMessage ? <div className="text-[11.5px] text-ink-soft">{aiMessage}</div> : null}
            <div className="text-[11.5px] leading-relaxed text-ink-faint">
              在 platform.deepseek.com 创建 Key；模型使用 deepseek-flash（支持 1M 上下文与 JSON 输出）。
            </div>
          </div>
        </Row>

        <Row label="关于">
          <div className="text-[12.5px] leading-relaxed text-ink-soft">
            我的记事簿 v{APP_VERSION} · Tauri 2 + React + SQLite + Tailwind
            <div className="pt-1 text-[11.5px] text-ink-faint">
              关闭窗口会收进系统托盘（提醒继续生效），真正退出请用托盘右键菜单。
            </div>
          </div>
        </Row>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-t border-line-soft py-3.5 first:border-t-0">
      <div className="w-[92px] flex-none pt-1 text-[13px] text-ink-mute">{label}</div>
      <div className="min-w-0 flex-1">
        {children}
        {hint ? <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">{hint}</div> : null}
      </div>
    </div>
  );
}

function PathLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="w-[52px] flex-none text-ink-mute">{label}</span>
      <span className="truncate rounded-md bg-side px-2 py-1 text-ink-soft" title={value}>
        {value}
      </span>
    </div>
  );
}
