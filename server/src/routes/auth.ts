import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { findOrCreateUser, getUserById } from '../services/userService.js';

export const authRouter = Router();

function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not set');
  return new OAuth2Client(clientId);
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

    // Optional allowlist: set ALLOWED_EMAILS="a@gmail.com,b@gmail.com" to restrict access
    const allowedEmails = process.env.ALLOWED_EMAILS;
    if (allowedEmails) {
      const allowed = allowedEmails.split(',').map(e => e.trim().toLowerCase());
      if (!allowed.includes(payload.email.toLowerCase())) {
        res.status(403).json({ error: 'Access denied. Your account is not on the allowlist.' });
        return;
      }
    }

    const user = findOrCreateUser(
      payload.sub,
      payload.email,
      payload.name || payload.email,
      payload.picture
    );

    req.session.userId = user.id;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        isAdmin: user.is_admin === 1,
        credits: user.credits,
      },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

authRouter.get('/me', (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'User not found' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      isAdmin: user.is_admin === 1,
    },
  });
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
