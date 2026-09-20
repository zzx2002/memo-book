import { DetailPanel } from './components/DetailPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { TaskList } from './components/TaskList';
import { AppProvider, useApp } from './state/AppContext';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { toast, error } = useApp();

  return (
    <div className="flex h-screen min-w-[1040px] flex-col overflow-hidden">
      {/* 三栏：每列都要 min-h-0，否则列会被内容撑高、内部滚动条失效 */}
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_452px] overflow-hidden">
        <Sidebar />
        <TaskList />
        <DetailPanel />
      </div>

      <SettingsDialog />

      {error ? (
        <div className="fixed left-1/2 top-4 max-w-[560px] -translate-x-1/2 rounded-xl border border-[#f6c9c5] bg-[#fdf1f0] px-4 py-3 text-[12.5px] text-hi shadow-pop">
          数据库连接失败：{error}
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-[10px] bg-[#2b3040] px-4 py-2.5 text-[13px] text-white shadow-pop">
          <span>{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              className="rounded-md bg-white/15 px-2 py-0.5 text-[12.5px] font-semibold text-white hover:bg-white/25"
              onClick={toast.undo}
            >
              撤销
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
