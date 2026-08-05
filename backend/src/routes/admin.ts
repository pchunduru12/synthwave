// backend/src/routes/admin.ts
//
// Admin-only endpoints. All routes here are double-gated:
//   1. authMiddleware  — must have a valid token
//   2. requireAdmin    — token's email must be in env.adminEmails
//
// Mounted at /v1/admin in app.ts.

import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/require-admin.js';
import {
  addInvite,
  deleteAdminCreation,
  disableUser,
  enableUser,
  findUserById,
  getAdminCreation,
  listAdminCreations,
  listInvites,
  listUsers,
  removeInvite,
} from '../services/admin-service.js';
import { HttpError } from '../lib/http-errors.js';

export const adminRouter = Router();

adminRouter.use(authMiddleware, requireAdmin);

function paramAsString(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

// ---- invites --------------------------------------------------------------

adminRouter.get('/invites', (_req: Request, res: Response) => {
  res.json({ invites: listInvites() });
});

adminRouter.post('/invites', (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) throw new HttpError(400, 'email_required');
    if (!email.includes('@')) throw new HttpError(400, 'invalid_email');
    const invites = addInvite(email);
    res.status(201).json({ invites });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/invites/:email', (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = decodeURIComponent(paramAsString(req.params.email));
    if (!email) throw new HttpError(400, 'email_required');
    const invites = removeInvite(email);
    res.json({ invites });
  } catch (error) {
    next(error);
  }
});

// ---- users ----------------------------------------------------------------

adminRouter.get('/users', (_req: Request, res: Response) => {
  const users = listUsers();
  const totals = users.reduce(
    (acc, u) => {
      acc.creations += u.creationCount;
      acc.spentUsd += u.totalSpentUsd;
      acc.inputTokens += u.inputTokens;
      acc.outputTokens += u.outputTokens;
      acc.totalTokens += u.totalTokens;
      return acc;
    },
    { creations: 0, spentUsd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );

  res.json({
    users,
    totals: {
      userCount: users.length,
      creationCount: totals.creations,
      totalSpentUsd: Math.round(totals.spentUsd * 10000) / 10000,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      totalTokens: totals.totalTokens,
    },
  });
});

adminRouter.post('/users/:id/disable', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramAsString(req.params.id);
    if (!id) throw new HttpError(400, 'id_required');
    const user = findUserById(id);
    if (!user) throw new HttpError(404, 'user_not_found');
    disableUser(id);
    res.json({ id, disabled: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/users/:id/enable', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramAsString(req.params.id);
    if (!id) throw new HttpError(400, 'id_required');
    const user = findUserById(id);
    if (!user) throw new HttpError(404, 'user_not_found');
    enableUser(id);
    res.json({ id, disabled: false });
  } catch (error) {
    next(error);
  }
});

// ---- creations ------------------------------------------------------------

adminRouter.get('/creations', (_req: Request, res: Response) => {
  res.json({ creations: listAdminCreations() });
});

adminRouter.get('/creations/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramAsString(req.params.id);
    if (!id) throw new HttpError(400, 'id_required');

    const creation = getAdminCreation(id);
    if (!creation) throw new HttpError(404, 'creation_not_found');

    res.json(creation);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/creations/:id/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramAsString(req.params.id);
    if (!id) throw new HttpError(400, 'id_required');

    const creation = getAdminCreation(id);
    if (!creation) throw new HttpError(404, 'creation_not_found');

    res.json(creation);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/creations/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramAsString(req.params.id);
    if (!id) throw new HttpError(400, 'id_required');

    const deleted = deleteAdminCreation(id);
    if (!deleted) throw new HttpError(404, 'creation_not_found');

    res.json({ id, deleted: true });
  } catch (error) {
    next(error);
  }
});
