import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { findOrCreateUser, getUserById, updateUserPreferences, type User } from '../services/userService.js';
import logger from '../services/logger.js';

export const authRouter = Router();

function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not set');
  return new OAuth2Client(clientId);
}

function isAccessAllowed(email: string): boolean {
  const ownerEmails = (process.env.OWNER_ACCOUNT || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (ownerEmails.includes(email.toLowerCase())) return true;

  const adminEmails = (process.env.ADMIN_ACCOUNT || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.includes(email.toLowerCase())) return true;

  return process.env.ENABLE_PUBLIC_ACCESS?.toUpperCase() === 'TRUE';
}

function toUserResponse(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    role: user.role,
    isAdmin: user.is_admin === 1,
    credits: user.role === 'owner' ? -1 : user.credits,
    homePort: user.home_port || null,
    defaultCurrency: user.default_currency || null,
  };
}

authRouter.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ error: 'Missing credential' });
      return;
    }

    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    if (!isAccessAllowed(payload.email)) {
      res.status(403).json({ error: 'Access denied. Public registration is currently disabled.' });
      return;
    }

    const user = await findOrCreateUser(
      payload.sub,
      payload.email,
      payload.name || payload.email,
      payload.picture
    );

    req.session.userId = user.id;

    res.json({ user: toUserResponse(user) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, message }, 'Google auth error');
    res.status(401).json({ error: 'Authentication failed', detail: message });
  }
});

authRouter.get('/me', async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = await getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'User not found' });
    return;
  }

  res.json({ user: toUserResponse(user) });
});

authRouter.patch('/preferences', async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { homePort, defaultCurrency } = req.body as { homePort?: string; defaultCurrency?: string };

  await updateUserPreferences(req.session.userId, {
    home_port: homePort !== undefined ? (homePort || null) : undefined,
    default_currency: defaultCurrency !== undefined ? (defaultCurrency || null) : undefined,
  });

  const user = await getUserById(req.session.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: toUserResponse(user) });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});
