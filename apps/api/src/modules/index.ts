import type { Router } from 'express';
import { authRouter } from './auth/auth.routes.js';

// Each module registers its router here (filled by later tasks); prefixes are relative to /api.
export const apiMounts: [prefix: string, router: Router][] = [['/auth', authRouter]];
