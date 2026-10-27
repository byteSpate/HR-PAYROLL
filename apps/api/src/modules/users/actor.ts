import { can } from '@erp/auth';
import type { Tx } from '@erp/db';
import { AppError } from '@erp/utils';
import { derivedGrants } from '../auth/derived-grants.js';
import { grantStrings } from '../auth/grant-strings.js';
import type { Caller } from './guards.js';

/**
 * The caller as the database sees them now, not as their access token claimed minutes ago.
 * A token outlives a demotion or an ownership transfer by up to its lifetime, and every
 * mutation under /users and /roles must stop honouring it at once. Call inside the
 * transaction that makes the change. `required` re-checks the route's own permission too.
 */
export async function loadActor(tx: Tx, sub: string, required?: string): Promise<Caller> {
  const user = await tx.user.findUnique({
    where: { id: sub },
    select: { isActive: true, accessLevel: true, role: { select: { permissions: true } } },
  });
  if (!user?.isActive) throw new AppError(401, 'Invalid or expired access token');
  const grants =
    user.accessLevel === 'STANDARD'
      ? [...new Set([...grantStrings(user.role?.permissions ?? []), ...(await derivedGrants(tx, sub))])]
      : [];
  const actor: Caller = { sub, accessLevel: user.accessLevel, grants };
  if (required && !can(actor, required)) throw new AppError(403, 'Forbidden', required);
  return actor;
}
