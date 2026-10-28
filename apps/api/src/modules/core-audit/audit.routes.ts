import { Router } from 'express';
import { z } from 'zod';
import { listAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';

export const auditRouter = Router();

auditRouter.use(requireAuth, requirePermission('audit.read'));

const querySchema = z.object({
  entity: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  changedBy: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

auditRouter.get('/', async (req, res) => {
  res.json(await listAudit(prisma, querySchema.parse(req.query)));
});
