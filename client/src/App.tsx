import { useEffect, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Header } from './components/layout/Header';
import { FlightSearchPage } from './components/flights/FlightSearchPage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { LoginPage } from './components/auth/LoginPage';
import { useAuthStore } from './store/useAuthStore';
import { fetchCurrentUser } from './services/authService';
import { verifyPurchase } from './services/creditService';
import { Loader2 } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function App() {
  const { isAuthenticated, isLoading, isAdmin } = useAuthStore();
  const setUser = useAuthStore((s) => s.setUser);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => setUser(user))
      .catch(() => setUser(null));
  }, [setUser]);

  // Handle return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (params.get('credits') === 'success' && sessionId) {
      // Verify payment and grant credits
      verifyPurchase(sessionId).then((credits) => {
        useAuthStore.getState().setCredits(credits);
      }).catch(() => {
        // Fallback: refresh user data
        fetchCurrentUser().then((user) => { if (user) setUser(user); });
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('credits') === 'cancel') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [setUser]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <LoginPage />
      </GoogleOAuthProvider>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header
        adminOpen={adminOpen}
        onToggleAdmin={isAdmin ? () => setAdminOpen(!adminOpen) : undefined}
      />
      {adminOpen && isAdmin ? <AdminDashboard /> : <FlightSearchPage />}
    </div>
  );
}
