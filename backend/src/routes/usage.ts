import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { budgetPatchSchema } from '../lib/validators.js';
import { getUsageSummary, patchBudgetSettings } from '../services/usage-service.js';

export const usageRouter = Router();

usageRouter.use(authMiddleware);

usageRouter.get('/me', (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json(getUsageSummary(user.id));
});

usageRouter.patch('/budgets', (req: Request, res: Response, next: NextFunction) => {
  try {
    const patch = budgetPatchSchema.parse(req.body);
    const user = (req as any).user;
    const budgets = patchBudgetSettings(user.id, patch);
    res.json({ budgets });
  } catch (error) {
    next(error);
  }
});
