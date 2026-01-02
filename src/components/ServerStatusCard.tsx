import React, { useState } from 'react';
import { ServerStatus, ServerStats, UserRole } from '../types';
import { Activity, Users, HardDrive, Cpu, Power, PowerOff, Lock } from 'lucide-react';

interface Props {
  status: ServerStatus;
  stats: ServerStats;
  onRefresh: () => void;
  userRole: UserRole;
  onPowerStart: () => Promise<void>;
  onPowerStop: () => Promise<void>;
}

const ServerStatusCard: React.FC<Props> = ({
  status,
  stats,
  onRefresh,
  userRole,
  onPowerStart,
  onPowerStop,
}) => {
  const canControlPower = userRole === 'owner' || userRole === 'admin';
  const [powerLoading, setPowerLoading] = useState<null | 'start' | 'stop'>(null);

  const getStatusColor = (s: ServerStatus) => {
    switch (s) {
      case ServerStatus.RUNNING:
        return 'text-green-400 bg-green-400/10 border-green-400/20';
      case ServerStatus.OFFLINE:
        return 'text-red-400 bg-red-400/10 border-red-400/20';
      case ServerStatus.STARTING:
      case ServerStatus.STOPPING:
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case ServerStatus.MAINTENANCE:
        return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusLabel = (s: ServerStatus) => {
    switch (s) {
      case ServerStatus.RUNNING:
        return '運行中';
      case ServerStatus.OFFLINE:
        return '已離線';
      case ServerStatus.STARTING:
        return '啟動中';
      case ServerStatus.STOPPING:
        return '停止中';
      case ServerStatus.MAINTENANCE:
        return '維護模式';
      default:
        return '未知';
    }
  };

  const handlePower = async (action: 'start' | 'stop') => {
    if (!canControlPower) return;
    if (powerLoading) return;

    setPowerLoading(action);
    try {
      if (action === 'start') {
        await onPowerStart();
      } else {
        await onPowerStop();
      }

      // 父層 powerStart/powerStop 已經 refreshOpsStatus 了，
      // 這裡再保險 refresh 一次（不會壞，只是多一次請求）
      await onRefresh();
    } catch (e: any) {
      const msg =
        e?.message ||
        e?.error ||
        (typeof e === 'string' ? e : '未知錯誤');
      alert(`❌ 電源操作失敗：${msg}`);
      console.error('Power action failed:', e);
    } finally {
      setPowerLoading(null);
    }
  };

  const startDisabled =
    !canControlPower ||
    powerLoading !== null ||
    status === ServerStatus.RUNNING ||
    status === ServerStatus.STARTING;

  const stopDisabled =
    !canControlPower ||
    powerLoading !== null ||
    status === ServerStatus.OFFLINE ||
    status === ServerStatus.STOPPING;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 shadow-lg">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            伺服器狀態
          </h2>
          <p className="text-gray-400 text-sm mt-1">v1.20.4 • 生存伺服器 (Survival)</p>
        </div>
        <div
          className={`px-3 py-1 rounded-full border text-sm font-medium capitalize flex items-center gap-2 ${getStatusColor(
            status
          )}`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
          {getStatusLabel(status)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-xs uppercase font-bold tracking-wider">線上玩家</span>
          </div>
          <div className="text-2xl font-mono text-gray-100">
            {stats.players}{' '}
            <span className="text-gray-500 text-base">/ {stats.maxPlayers}</span>
          </div>
        </div>

        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Cpu className="w-4 h-4" />
            <span className="text-xs uppercase font-bold tracking-wider">CPU 負載</span>
          </div>
          <div className="text-2xl font-mono text-gray-100">{stats.cpu}%</div>
        </div>

        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <HardDrive className="w-4 h-4" />
            <span className="text-xs uppercase font-bold tracking-wider">記憶體使用</span>
          </div>
          <div className="text-2xl font-mono text-gray-100">
            {(stats.memory / 1024).toFixed(1)}{' '}
            <span className="text-gray-500 text-base">GB</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 relative">
        {!canControlPower && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center border border-gray-700">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Lock className="w-4 h-4" />
              <span>您沒有權限執行電源操作</span>
            </div>
          </div>
        )}

        <button
          onClick={() => handlePower('start')}
          disabled={startDisabled}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Power className="w-4 h-4" />
          {powerLoading === 'start' ? '啟動中...' : '啟動伺服器'}
        </button>

        <button
          onClick={() => handlePower('stop')}
          disabled={stopDisabled}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <PowerOff className="w-4 h-4" />
          {powerLoading === 'stop' ? '停止中...' : '停止伺服器'}
        </button>
      </div>
    </div>
  );
};

export default ServerStatusCard;
