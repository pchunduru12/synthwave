import { NextFunction, Request, Response, Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'synthwave-next-beta', ts: new Date().toISOString() });
});
