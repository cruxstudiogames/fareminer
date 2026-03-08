import type { Request, Response, NextFunction } from 'express';
import { getUserById } from '../services/userService.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.is_admin !== 1) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
