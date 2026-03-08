import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, DollarSign, Database, Activity, Trash2, Loader2 } from 'lucide-react';
import { fetchAdminStats, fetchAdminConfig, evictCache } from '../../services/adminService';
import type { AdminStats, AdminConfig } from '../../services/adminService';

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [evicting, setEvicting] = useState(false);
  const [evictMessage, setEvictMessage] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([fetchAdminStats(), fetchAdminConfig()])
      .then(([s, c]) => { setStats(s); setConfig(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleEvict = async () => {
    setEvicting(true);
    setEvictMessage('');
    try {
      const result = await evictCache();
      setEvictMessage(result.message);
      loadData();
    } catch {
      setEvictMessage('Failed to evict cache');
    } finally {
      setEvicting(false);
    }
  };

  if (loading || !stats || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="w-4 h-4 text-blue-600" />} label="Users" value={stats.userCount} />
        <StatCard icon={<DollarSign className="w-4 h-4 text-green-600" />} label="Revenue" value={`$${stats.revenue.toFixed(2)}`} />
        <StatCard icon={<Database className="w-4 h-4 text-purple-600" />} label="Cache Size" value={`${stats.cacheDbSizeMB} MB`} />
        <StatCard icon={<Activity className="w-4 h-4 text-amber-600" />} label="Cached Queries" value={`${stats.cacheQueryCount} / ${stats.cacheResultCount} results`} />
      </div>

      {/* Cache config info */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Cache Policy</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Visible: {config.cacheVisibleDays} days &middot; Eviction: {config.cacheAgeDays} days
            </p>
          </div>
          <div className="flex items-center gap-2">
            {evictMessage && <span className="text-xs text-gray-500">{evictMessage}</span>}
            <button
              onClick={handleEvict}
              disabled={evicting}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
            >
              {evicting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Evict Old Cache
            </button>
          </div>
        </div>
      </div>

      {/* Queries by day chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">API Queries by Day (Last 30 Days)</h3>
        {stats.queriesByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.queriesByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-gray-400 py-4 text-center">No query data yet</p>
        )}
      </div>

      {/* Top users table */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Top 10 Most Active Users</h3>
        {stats.topUsers.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-1 font-medium">#</th>
                <th className="pb-1 font-medium">Name</th>
                <th className="pb-1 font-medium">Email</th>
                <th className="pb-1 font-medium text-right">Searches</th>
              </tr>
            </thead>
            <tbody>
              {stats.topUsers.map((u, i) => (
                <tr key={u.email} className="border-b border-gray-50">
                  <td className="py-1 text-gray-400">{i + 1}</td>
                  <td className="py-1 text-gray-700">{u.name}</td>
                  <td className="py-1 text-gray-500">{u.email}</td>
                  <td className="py-1 text-right font-medium text-gray-700">{u.searchCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-gray-400 py-4 text-center">No search activity yet</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-lg font-bold text-gray-800">{value}</div>
    </div>
  );
}
