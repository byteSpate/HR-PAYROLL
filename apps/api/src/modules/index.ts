import type { Router } from 'express';
import { authRouter } from './auth/auth.routes.js';
import { rolesRouter } from './users/roles.routes.js';
import { usersRouter } from './users/users.routes.js';

// Each module registers its router here (filled by later tasks); prefixes are relative to /api.
export const apiMounts: [prefix: string, router: Router][] = [
  ['/auth', authRouter],
  ['/users', usersRouter],
  ['/roles', rolesRouter],
];
