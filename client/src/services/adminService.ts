export interface AdminStats {
  userCount: number;
  revenue: number;
  topUsers: Array<{ name: string; email: string; searchCount: number }>;
  queriesByDay: Array<{ date: string; count: number }>;
  cacheDbSizeMB: number;
  cacheQueryCount: number;
  cacheResultCount: number;
}

export interface AdminConfig {
  cacheAgeDays: number;
  cacheVisibleDays: number;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const response = await fetch('/api/admin/stats', { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch admin stats');
  return response.json();
}

export async function fetchAdminConfig(): Promise<AdminConfig> {
  const response = await fetch('/api/admin/config', { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch admin config');
  return response.json();
}

export async function evictCache(): Promise<{ deleted: number; message: string }> {
  const response = await fetch('/api/admin/evict-cache', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to evict cache');
  return response.json();
}
