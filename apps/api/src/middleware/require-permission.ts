import type { NextFunction, Request, Response } from 'express';
import { hasPermission } from '@erp/auth';

// Assumes requireAuth ran first; a missing user is treated as no permissions.
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !hasPermission(req.user.permissions, permission)) {
      return res.status(403).json({ error: 'Forbidden', permission });
    }
    return next();
  };
}
