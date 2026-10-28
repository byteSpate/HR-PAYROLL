import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@erp/utils';

// Express recognises error middleware by its four-argument arity, so _next must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    // Details go first so they can never replace the message or code.
    return res
      .status(err.status)
      .json({ ...err.details, error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  // Handlers throw from schema.parse(); without this an input mistake would surface as a 500.
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request body', issues: err.issues });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}
