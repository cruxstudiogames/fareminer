import { useState } from 'react';
import { Plane, LogOut, Coins, Settings } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { logout, updatePreferences } from '../../services/authService';
import { purchaseCredits } from '../../services/creditService';
import { AirportInput } from '../flights/AirportInput';

export function Header() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [purchasing, setPurchasing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    useAuthStore.getState().clearAuth();
    window.location.reload();
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const url = await purchaseCredits();
      window.location.href = url;
    } catch {
      alert('Failed to start purchase. Please try again.');
      setPurchasing(false);
    }
  };

  const handleSavePreference = async (key: 'homePort' | 'defaultCurrency', value: string) => {
    try {
      const updated = await updatePreferences({ [key]: value });
      setUser(updated);
    } catch {
      // silently fail
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 flex-shrink-0">
      <div className="h-12 flex items-center px-3 sm:px-4 gap-2 sm:gap-4">
        <div className="flex items-center gap-2 text-blue-600">
          <Plane className="w-5 h-5" />
          <span className="font-bold text-base">Fare Miner</span>
        </div>

        <div className="flex-1" />

        {user && (
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-1 mr-1">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium text-gray-700">
                {user.role === 'owner' ? '\u221e' : user.credits}
              </span>
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 disabled:opacity-50"
              >
                {purchasing ? '...' : 'Buy'}
              </button>
            </div>
            {user.picture && (
              <img
                src={user.picture}
                alt=""
                className="w-7 h-7 rounded-full"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="text-xs text-gray-600 max-w-24 truncate hidden md:inline">{user.name}</span>
            {(user.role === 'owner' || user.role === 'admin') && (
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                user.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {user.role}
              </span>
            )}
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-50"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 px-1.5 py-1 rounded hover:bg-gray-50"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* User Settings Panel */}
      {settingsOpen && user && (
        <UserSettingsPanel
          homePort={user.homePort || ''}
          defaultCurrency={user.defaultCurrency || ''}
          onSave={handleSavePreference}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  );
}

function UserSettingsPanel({ homePort, defaultCurrency, onSave, onClose }: {
  homePort: string;
  defaultCurrency: string;
  onSave: (key: 'homePort' | 'defaultCurrency', value: string) => void;
  onClose: () => void;
}) {
  const [port, setPort] = useState(homePort);
  const [currency, setCurrency] = useState(defaultCurrency);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-3 top-12 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-72">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">User Settings</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Home Airport</label>
            <AirportInput
              value={port}
              onChange={(code) => {
                setPort(code);
                if (code.length === 3 || code === '') onSave('homePort', code);
              }}
              placeholder="e.g. SYD"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Default departure airport for searches</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Default Currency</label>
            <input
              value={currency}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setCurrency(val);
                if (val.length === 3 || val === '') onSave('defaultCurrency', val);
              }}
              placeholder="e.g. AUD"
              maxLength={3}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Default currency for price display</p>
          </div>
        </div>
      </div>
    </>
  );
}
