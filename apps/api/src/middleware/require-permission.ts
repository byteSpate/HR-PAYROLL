import type { NextFunction, Request, Response } from 'express';
import { can } from '@erp/auth';

// Assumes requireAuth ran first; a missing user is treated as no permissions.
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !can(req.user, permission)) {
      return res.status(403).json({ error: 'Forbidden', permission });
    }
    return next();
  };
}
