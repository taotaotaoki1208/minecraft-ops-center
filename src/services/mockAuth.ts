import { User, UserRole } from '../types';

export class MockAuthService {
  private static readonly MOCK_USERS: User[] = [
    {
      id: '1',
      username: 'ServerOwner',
      role: 'owner',
      avatar: 'https://ui-avatars.com/api/?name=Owner&background=ef4444&color=fff'
    },
    {
      id: '2',
      username: 'SiteAdmin',
      role: 'admin',
      avatar: 'https://ui-avatars.com/api/?name=Admin&background=3b82f6&color=fff'
    },
    {
      id: '3',
      username: 'MonitorUser',
      role: 'viewer',
      avatar: 'https://ui-avatars.com/api/?name=Viewer&background=10b981&color=fff'
    }
  ];

  static async login(role: UserRole): Promise<User> {
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 800));
    const user = this.MOCK_USERS.find(u => u.role === role);
    if (!user) throw new Error('User not found');
    return user;
  }
}