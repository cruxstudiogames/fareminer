import { useState } from 'react';
import { Plane, LogOut, Coins } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { logout } from '../../services/authService';
import { purchaseCredits } from '../../services/creditService';

export function Header() {
  const user = useAuthStore((s) => s.user);
  const [purchasing, setPurchasing] = useState(false);

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
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 px-1.5 py-1 rounded hover:bg-gray-50"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
