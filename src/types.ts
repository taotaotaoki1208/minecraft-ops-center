export enum ServerStatus {
  OFFLINE = 'offline',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  MAINTENANCE = 'maintenance'
}

export enum MaintenanceStep {
  IDLE = 'IDLE',
  ANNOUNCING = 'ANNOUNCING',
  WHITELISTING = 'WHITELISTING',
  KICKING = 'KICKING',
  BACKUP = 'BACKUP',
  STOPPING = 'STOPPING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type UserRole = 'owner' | 'admin' | 'viewer';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  avatar: string;
}

export interface ServerStats {
  memory: number; // in MB
  cpu: number; // percentage
  disk: number; // in MB
  uptime: number; // seconds
  players: number;
  maxPlayers: number;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'cmd';
  message: string;
}

export interface DiscordMessage {
  id: string;
  author: string;
  avatar: string;
  content?: string;
  embed?: {
    title: string;
    description: string;
    color: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
    timestamp?: string;
  };
  timestamp: Date;
}

export interface MaintenanceConfig {
  announceTime: number; // seconds to wait after announcement
  kickPlayers: boolean;
  createBackup: boolean;
  stopServer: boolean;
  reason: string;
}