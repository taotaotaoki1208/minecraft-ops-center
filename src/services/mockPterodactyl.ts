import { ServerStatus, ServerStats } from '../types';

// This service mimics the behavior of the Node.js backend interacting with Pterodactyl
export class MockPterodactylService {
  private static instance: MockPterodactylService;
  private status: ServerStatus = ServerStatus.RUNNING;
  private stats: ServerStats = {
    memory: 2048,
    cpu: 15,
    disk: 10240,
    uptime: 3600,
    players: 12,
    maxPlayers: 100
  };

  private constructor() {}

  public static getInstance(): MockPterodactylService {
    if (!MockPterodactylService.instance) {
      MockPterodactylService.instance = new MockPterodactylService();
    }
    return MockPterodactylService.instance;
  }

  public async getStatus(): Promise<ServerStatus> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    return this.status;
  }

  public async getStats(): Promise<ServerStats> {
    await new Promise(resolve => setTimeout(resolve, 300));
    // Fluctuate stats slightly for realism
    if (this.status === ServerStatus.RUNNING) {
      this.stats.memory = 2048 + Math.floor(Math.random() * 500);
      this.stats.cpu = 10 + Math.floor(Math.random() * 40);
      this.stats.players = Math.max(0, Math.min(100, this.stats.players + (Math.random() > 0.5 ? 1 : -1)));
    } else {
      this.stats.memory = 0;
      this.stats.cpu = 0;
      this.stats.players = 0;
    }
    return { ...this.stats };
  }

  public async sendCommand(command: string): Promise<void> {
    console.log(`[Pterodactyl API] Sending command: ${command}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  public async setPowerState(state: 'start' | 'stop' | 'restart'): Promise<void> {
    console.log(`[Pterodactyl API] Power signal: ${state}`);
    if (state === 'stop') {
      this.status = ServerStatus.STOPPING;
      setTimeout(() => { this.status = ServerStatus.OFFLINE; }, 2000);
    } else if (state === 'start') {
      this.status = ServerStatus.STARTING;
      setTimeout(() => { this.status = ServerStatus.RUNNING; }, 3000);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  public async createBackup(): Promise<boolean> {
    console.log(`[Pterodactyl API] Creating backup...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Backup takes time
    // 90% chance of success
    return Math.random() > 0.1;
  }
}