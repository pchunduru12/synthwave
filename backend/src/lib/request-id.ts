import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID();
  res.setHeader('X-Request-ID', id);
  (req as Request & { requestId?: string }).requestId = id;
  next();
}
