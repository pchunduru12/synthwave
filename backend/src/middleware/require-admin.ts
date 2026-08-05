// backend/src/middleware/require-admin.ts — NEW FILE
//
// Gates a route to admin emails only. Must be used AFTER authMiddleware
// has populated req.user.

import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http-errors.js';
import { isAdminEmail } from '../services/admin-service.js';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) {
    return next(new HttpError(401, 'unauthorized'));
  }
  if (!isAdminEmail(user.email)) {
    return next(new HttpError(403, 'admin_required'));
  }
  next();
}
