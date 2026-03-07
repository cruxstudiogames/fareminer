import { GoogleLogin } from '@react-oauth/google';
import { Plane } from 'lucide-react';
import { loginWithGoogle } from '../../services/authService';
import { useAuthStore } from '../../store/useAuthStore';
import { useState } from 'react';

export function LoginPage() {
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState('');

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2 text-blue-600 mb-2">
          <Plane className="w-8 h-8" />
          <span className="font-bold text-2xl">Fare Miner</span>
        </div>
        <p className="text-gray-500 text-sm mb-6">
          Sign in to plan and save your trips
        </p>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (response) => {
              try {
                if (!response.credential) throw new Error('No credential received');
                const user = await loginWithGoogle(response.credential);
                setUser(user);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Login failed');
              }
            }}
            onError={() => setError('Google sign-in failed')}
            theme="outline"
            size="large"
            text="signin_with"
          />
        </div>
      </div>
    </div>
  );
}
