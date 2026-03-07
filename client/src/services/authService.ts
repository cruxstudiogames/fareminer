export interface AuthUser {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  isAdmin: boolean;
  credits: number;
}

export async function loginWithGoogle(credential: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Login failed');
  }

  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Failed to check auth status');
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}
