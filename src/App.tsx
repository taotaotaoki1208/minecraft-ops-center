import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Settings, Ghost, LogOut } from 'lucide-react';
import { ServerStatus, DiscordMessage, User, ServerStats } from './types';
import ServerStatusCard from './components/ServerStatusCard';
import MaintenanceManager from './components/MaintenanceManager';
import DiscordPreview from './components/DiscordPreview';
import ArchitectureDocs from './components/ArchitectureDocs';
import LoginScreen from './components/LoginScreen';
import { auth } from "./services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { apiGet, apiPost, type ApiError } from "./services/api";
import PterodactylKeySettings from "./components/PterodactylKeySettings";

// Simple nav item component
const NavItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
      active ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span className="font-medium">{label}</span>
  </button>
);

const App: React.FC = () => {
  const [maintLoading, setMaintLoading] = useState(false);
const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");
  const [maintMode, setMaintMode] = useState<"NORMAL" | "MAINTENANCE">("NORMAL");
  const [maintReason, setMaintReason] = useState("");
const [maintEta, setMaintEta] = useState("");
const [announceLoading, setAnnounceLoading] = useState(false);

  const [serverStatus, setServerStatus] = useState<ServerStatus>(ServerStatus.RUNNING);
  const [serverStats, setServerStats] = useState<ServerStats>({
  memory: 0,
  cpu: 0,
  disk: 0,
  uptime: 0,
  players: 0,
  maxPlayers: 100,
});
  const [pteroBound, setPteroBound] = useState<boolean | null>(null); // null=讀取中
const [pteroLast4, setPteroLast4] = useState<string | null>(null);

  
  const [discordMessages, setDiscordMessages] = useState<DiscordMessage[]>([]);


const handleApiError = (e: any) => {
  const err = e as ApiError;

  if (err?.status === 412 || err?.code === "PTERO_KEY_NOT_SET") {
    alert("⚠️ 你還沒綁定 Pterodactyl API Key，請先到「系統設定」綁定。");
    setActiveTab("settings");

    // ✅ 這兩行很重要：讓 polling 條件失效（之後不會一直撞 412）
    setPteroBound(false);
    setPteroLast4(null);

    return true;
  }
  return false;
};
const sendMaintAnnouncement = async () => {
  if (!maintReason.trim()) {
    alert("⚠️ 請先輸入維護原因");
    return;
  }

  setAnnounceLoading(true);
  try {
    // 1) 送到 Discord（後端）
    await apiPost("/api/discord/announce", {
      title: "🛠️ 維護通知",
      reason: maintReason.trim(),
      message: maintEta.trim() ? `⏱️ 預估時間：${maintEta.trim()}` : undefined,
      remindKick: true,
    });

    // 2) 同步顯示在「Discord 即時預覽」（前端）
    const content =
      `**🛠️ 維護通知**\n` +
      `🛠️ 原因：${maintReason.trim()}\n` +
      (maintEta.trim() ? `⏱️ 預估時間：${maintEta.trim()}\n` : "") +
      `⚠️ 請玩家盡快下線，避免資料異常。\n`;

    handleDiscordLog({
      id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
      author: currentUser?.username ?? "Ops Center",
      avatar: currentUser?.avatar ?? "",
      content,
      timestamp: new Date(),
    });

    alert("✅ Discord 公告已送出");
  } catch (e: any) {
    if (handleApiError(e)) return;
    alert(`❌ 公告失敗：${e.message}`);
  } finally {
    setAnnounceLoading(false);
  }
};

const refreshPteroBinding = async () => {
  try {
    const r = await apiGet("/api/ptero-key");
    // 你的後端回傳 { ok: true, bound: boolean, last4?: string } 或類似
    // 你目前的 getUserPteroMeta 似乎會回 meta，這裡做保守判斷：
    const bound = !!(r?.bound ?? r?.last4 ?? r?.pteroKey?.last4);
    setPteroBound(bound);
    setPteroLast4(r?.last4 ?? r?.pteroKey?.last4 ?? null);
  } catch (e: any) {
    // 如果被 401/其他錯誤，就不要一直跳 alert
    setPteroBound(false);
    setPteroLast4(null);
  }
};
const refreshDiscordMessages = async () => {
  try {
    const r = await apiGet("/api/discord/messages?limit=20");
    const raw = (r?.messages ?? []) as any[];

    const msgs: DiscordMessage[] = raw.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp), // ✅ 轉回 Date
    }));

    setDiscordMessages(msgs.reverse());
  } catch (e: any) {
    console.warn("refreshDiscordMessages failed:", e);
  }
};

const refreshOpsStatus = async () => {
  try {
    // 1) 維護模式
    const maint = await apiGet("/api/maintenance/status");
    const mode = (maint?.mode ?? maint?.state?.mode ?? "NORMAL") as "NORMAL" | "MAINTENANCE";
    setMaintMode(mode);

    // 2) 狀態與資源
    const st = await apiGet("/api/status");
    console.log("[/api/status raw]", st);

    // status：對齊 enum（小寫字串）
    const raw = String(st?.server?.status ?? st?.status ?? "offline").toLowerCase();

    const mappedStatus: ServerStatus =
      raw === ServerStatus.RUNNING ? ServerStatus.RUNNING :
      raw === ServerStatus.STARTING ? ServerStatus.STARTING :
      raw === ServerStatus.STOPPING ? ServerStatus.STOPPING :
      raw === ServerStatus.MAINTENANCE ? ServerStatus.MAINTENANCE :
      ServerStatus.OFFLINE;

    setServerStatus(mappedStatus);

    // stats：types.ts 定義 memory/disk 是 MB、uptime 是秒
    const cpu = Number(st?.stats?.cpu ?? 0);

    const memoryBytes = Number(st?.stats?.memoryBytes ?? 0);
    const diskBytes = Number(st?.stats?.diskBytes ?? 0);

    const memoryMB = Number((memoryBytes / 1024 / 1024).toFixed(1));
    const diskMB = Number((diskBytes / 1024 / 1024).toFixed(1));

    const uptimeSeconds = Number(st?.stats?.uptimeSeconds ?? st?.stats?.uptime ?? 0);
    const playersOnline = st?.server?.playersOnline;
const maxPlayersRaw = st?.server?.maxPlayers;

const players =
  playersOnline === null || playersOnline === undefined ? 0 : Number(playersOnline);

const maxPlayers =
  maxPlayersRaw === null || maxPlayersRaw === undefined ? 100 : Number(maxPlayersRaw);

setServerStats({
  cpu,
  memory: memoryMB,
  disk: diskMB,
  uptime: uptimeSeconds,
  players,
  maxPlayers,
});

    setLastUpdatedAt(Date.now());
  } catch (e: any) {
    if (handleApiError(e)) return;
    console.error("refreshOpsStatus failed:", e);
  }
};

const startMaintenance = async () => {
  setMaintLoading(true);
  try {
    await apiPost("/api/maintenance/start");
    await refreshOpsStatus();
  } catch (e: any) {
    if (handleApiError(e)) return;
    alert(`❌ 啟動維護失敗：${e.message}`);
  } finally {
    setMaintLoading(false);
  }
};
const powerStart = async () => {
  await apiPost("/api/power/start");
  await refreshOpsStatus();
};

const powerStop = async () => {
  await apiPost("/api/power/stop");
  await refreshOpsStatus();
};
const stopMaintenance = async () => {
  setMaintLoading(true);
  try {
    await apiPost("/api/maintenance/stop");
    await refreshOpsStatus();
  } catch (e: any) {
    if (handleApiError(e)) return;
    alert(`❌ 結束維護失敗：${e.message}`);
  } finally {
    setMaintLoading(false);
  }
};


useEffect(() => {
  const unsub = onAuthStateChanged(auth, (fbUser) => {
    if (!fbUser) {
      setCurrentUser(null);
      return;
    }

    setCurrentUser({
      id: fbUser.uid,
      username: fbUser.email || "admin",
      role: "admin",
      avatar: `https://api.dicebear.com/8.x/bottts/svg?seed=${fbUser.uid}`,
    });
  });

  return () => unsub();
}, []);

 

// ② 使用者登入後，檢查是否已綁定 Ptero Key（新的）
useEffect(() => {
  if (!currentUser) return;
  refreshPteroBinding();
}, [currentUser]);
useEffect(() => {
  if (!currentUser) return;
  if (pteroBound !== true) return;

  const tick = async () => {
    await refreshOpsStatus();
    await refreshDiscordMessages(); // ✅ 同步抓 Discord
  };

  tick(); // 先抓一次
  const id = window.setInterval(tick, 2500);

  return () => window.clearInterval(id);
}, [currentUser, pteroBound]);
  const handleDiscordLog = (msg: DiscordMessage) => {
    setDiscordMessages(prev => [...prev, msg]);
  };

 const handleLogout = async () => {
  await signOut(auth);
  setCurrentUser(null);
  setDiscordMessages([]);
};




  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col p-4">
        <div className="flex items-center gap-3 px-4 py-4 mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Ghost className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Ops Center</h1>
            <p className="text-xs text-gray-500">v1.2.0 (zh-TW)</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem 
            icon={LayoutDashboard} 
            label="監控儀表板" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          
          <NavItem 
  icon={Settings} 
  label="系統設定" 
  active={activeTab === 'settings'} 
  onClick={() => setActiveTab('settings')} 
/>
        </nav>

        <div className="mt-auto pt-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-4 px-2">
             <img src={currentUser.avatar} alt="Avatar" className="w-8 h-8 rounded-full bg-gray-700" />
             <div className="text-sm overflow-hidden">
                <p className="font-medium truncate">{currentUser.username}</p>
                <p className="text-gray-500 text-xs uppercase">{currentUser.role}</p>
             </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-red-400 hover:bg-red-500/10 py-2 rounded-lg text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" /> 登出系統
          </button>
        </div>
      </div>

      {/* Main Content */}
<main className="flex-1 overflow-y-auto p-8 bg-gray-900">
  {/* DASHBOARD */}
  {activeTab === "dashboard" && (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">伺服器總覽 (Server Overview)</h2>
            <p className="text-gray-400">管理維護週期、監控即時狀態與 Discord 連動。</p>
          </div>
          
{pteroBound === false && (
  <div className="mt-4 rounded-lg border border-yellow-700/40 bg-yellow-500/10 px-4 py-3 text-yellow-200">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-semibold">尚未綁定 Pterodactyl API Key</p>
        <p className="text-sm text-yellow-200/80">
          你需要先到「系統設定」綁定自己的 Client API Key 才能操作伺服器。
        </p>
      </div>
      <button
        onClick={() => setActiveTab("settings")}
        className="shrink-0 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 px-3 py-2 text-sm font-medium"
      >
        前往綁定
      </button>
    </div>
  </div>
  
)}
{lastUpdatedAt && (
  <div className="text-xs text-gray-500 mt-2">
    最後更新：{new Date(lastUpdatedAt).toLocaleTimeString("zh-TW")}
  </div>
)}
{pteroBound === true && pteroLast4 && (
  <div className="mt-4 text-sm text-emerald-300/80">
    ✅ 已綁定 Pterodactyl Key（末四碼：{pteroLast4}）
  </div>
)}
          {/* ✅ 維護狀態徽章 */}
          <div className="mt-1">
            {maintMode === "MAINTENANCE" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 text-orange-300 px-3 py-1 text-sm">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                維護中
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 text-emerald-300 px-3 py-1 text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                正常
              </span>
            )}
          </div>
        </div>

      <div className="mt-4 flex flex-wrap gap-3">
  <button
    onClick={async () => {
      try {
        await refreshOpsStatus();
        alert("✅ 已刷新狀態");
      } catch (e: any) {
        if (handleApiError(e)) return;
        alert(`❌ 失敗：${e.message}`);
      }
    }}
    className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg font-medium border border-gray-700"
  >
    讀取後端狀態
  </button>

  <button
    onClick={async () => {
      try {
        await apiPost("/api/command", {
          command: "say [OpsCenter] 測試：網站已成功送出指令！",
        });
        alert("✅ 已送出 say 指令");
      } catch (e: any) {
        if (handleApiError(e)) return;
        alert(`❌ 失敗：${e.message}`);
      }
    }}
    className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg font-medium"
  >
    測試 say 指令
  </button>

  <button
    onClick={startMaintenance}
    disabled={maintLoading || pteroBound !== true}
    className={`px-4 py-2 rounded-lg font-medium ${
      maintLoading || pteroBound !== true
        ? "bg-orange-900/40 text-orange-200/40 cursor-not-allowed"
        : "bg-orange-600 hover:bg-orange-500"
    }`}
  >
    {maintLoading ? "處理中..." : "啟動維護模式"}
  </button>

  <button
    onClick={stopMaintenance}
    disabled={maintLoading || pteroBound !== true}
    className={`px-4 py-2 rounded-lg font-medium ${
      maintLoading || pteroBound !== true
        ? "bg-sky-900/40 text-sky-200/40 cursor-not-allowed"
        : "bg-sky-600 hover:bg-sky-500"
    }`}
  >
    {maintLoading ? "處理中..." : "結束維護模式"}
  </button>
</div>
      </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Left Col: Status & Controls */}
  <div className="lg:col-span-2 space-y-6">
    <ServerStatusCard
      status={serverStatus}
      stats={serverStats}
      onRefresh={refreshOpsStatus}
      userRole={currentUser.role}
      onPowerStart={powerStart}
      onPowerStop={powerStop}
    />

    {/* ✅ 維護公告：放在伺服器狀態下面 */}
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-gray-200">📢 維護公告（先公告再維護）</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={maintReason}
          onChange={(e) => setMaintReason(e.target.value)}
          placeholder="維護原因（例：插件更新、版本升級、緊急修復）"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        />

        <input
          value={maintEta}
          onChange={(e) => setMaintEta(e.target.value)}
          placeholder="預估維護時間（例：10 分鐘 / 30 分鐘）"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          disabled={announceLoading || pteroBound !== true || !maintReason.trim()}
          onClick={async () => {
            try {
              setAnnounceLoading(true);

              await apiPost("/api/discord/announce", {
                title: "🛠️ 維護通知",
                reason: maintReason.trim(),
                message: maintEta.trim() ? `⏱️ 預估時間：${maintEta.trim()}` : undefined,
                remindKick: true,
              });

              // ✅ 同步顯示到右側 Discord 即時預覽
              const previewText =
                `🛠️ 維護通知\n` +
                `原因：${maintReason.trim()}\n` +
                (maintEta.trim() ? `預估時間：${maintEta.trim()}\n` : "") +
                `⚠️ 請玩家盡快下線，避免資料異常。`;

              setDiscordMessages((prev) => [
                ...prev,
                {
                  id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
                  author: currentUser.username,
                  avatar: currentUser.avatar,
                  content: previewText,
                  timestamp: new Date(),
                },
              ]);

              alert("✅ Discord 公告已送出");
            } catch (e: any) {
              if (handleApiError(e)) return;
              alert(`❌ 公告失敗：${e.message}`);
            } finally {
              setAnnounceLoading(false);
            }
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            announceLoading || pteroBound !== true || !maintReason.trim()
              ? "bg-indigo-900/40 text-indigo-200/40 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500"
          }`}
        >
          {announceLoading ? "發送中..." : "📢 發送 Discord 公告"}
        </button>

        <span className="text-xs text-gray-400">
          發送後再手動啟動維護模式
        </span>
      </div>
    </div>

    <MaintenanceManager
      onDiscordLog={handleDiscordLog}
      isRunning={serverStatus === ServerStatus.RUNNING}
      currentUser={currentUser}
    />
  </div>

  {/* Right Col: Discord Preview */}
  <div className="lg:col-span-1">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="font-semibold text-gray-300 flex items-center gap-2">
        Discord 即時預覽
      </h3>
      <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">
        BOT 線上
      </span>
    </div>

    <DiscordPreview messages={discordMessages} />
  </div>
</div>
    </div>
  )}


  {/* SETTINGS */}
  {activeTab === "settings" && (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">系統設定</h2>
        <p className="text-gray-400">綁定每位使用者自己的 Pterodactyl Client API Key</p>
      </div>

      <PterodactylKeySettings />
    </div>
  )}
</main>

    </div>
  );
};

export default App;