import type { NextFunction, Request, Response } from 'express';
import { can } from '@erp/auth';

// Assumes requireAuth ran first; a missing user is treated as no permissions.
/** One permission, or a list that passes when any entry is held (same rule as nav items). */
export function requirePermission(permission: string | readonly string[]) {
  const anyOf = typeof permission === 'string' ? [permission] : permission;
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !anyOf.some((p) => can(user, p))) {
      return res.status(403).json({ error: 'Forbidden', permission });
    }
    return next();
  };
}
