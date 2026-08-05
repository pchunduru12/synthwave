import { NextFunction, Request, Response } from 'express';
import { authenticateToken } from '../services/auth-service.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }

  try {
    const user = authenticateToken(token);
    (req as Request & { user?: typeof user }).user = user;
    next();
  } catch (error: any) {
    res.status(error.statusCode || 401).json({ error: error.message || 'invalid_token' });
  }
}
