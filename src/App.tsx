import { DetailPanel } from './components/DetailPanel';
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
  const { toast, storage, error } = useApp();

  return (
    <div className="grid h-screen min-w-[1040px] grid-rows-[44px_1fr] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-side px-4">
        <div className="text-[12.5px] tracking-wide text-ink-mute">我的记事簿</div>
        <div className="ml-auto text-[11.5px] text-ink-faint">
          {storage === 'sqlite' ? '本地 SQLite 存储' : '浏览器预览模式（数据存在 localStorage）'}
        </div>
      </div>

      <div className="grid grid-cols-[240px_1fr_452px] overflow-hidden">
        <Sidebar />
        <TaskList />
        <DetailPanel />
      </div>

      {error ? (
        <div className="fixed left-1/2 top-[64px] max-w-[560px] -translate-x-1/2 rounded-xl border border-[#f6c9c5] bg-[#fdf1f0] px-4 py-3 text-[12.5px] text-hi shadow-pop">
          数据库连接失败：{error}
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed bottom-7 left-1/2 -translate-x-1/2 rounded-[10px] bg-[#2b3040] px-4 py-2.5 text-[13px] text-white shadow-pop">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
