import type { Scope as ContractScope } from '@erp/contracts';
import type { Scope } from './generated/prisma/client.js';

// The wire and manifest spelling is lowercase; the database enum is uppercase.
export const toDbScope = (scope: ContractScope): Scope => scope.toUpperCase() as Scope;
export const fromDbScope = (scope: Scope): ContractScope => scope.toLowerCase() as ContractScope;
