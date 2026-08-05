import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(error: any, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(422).json({ error: 'validation_error', details: error.issues });
    return;
  }
  if (error?.statusCode) {
    res.status(error.statusCode).json({ error: error.message, details: error.details });
    return;
  }
  res.status(500).json({ error: 'internal_server_error' });
}
