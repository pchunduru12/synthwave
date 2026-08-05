// backend/src/routes/auth.ts — drop-in replacement
import { NextFunction, Request, Response, Router } from 'express';
import { loginSchema, registerSchema } from '../lib/validators.js';
import { loginUser, registerUser } from '../services/auth-service.js';
import { isAdminEmail } from '../services/admin-service.js';
import { authMiddleware } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input as { email: string; password: string; displayName: string });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input as { email: string; password: string });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    plan: user.plan,
    creditsRemaining: user.creditsRemaining,
    isAdmin: isAdminEmail(user.email),
  });
});
