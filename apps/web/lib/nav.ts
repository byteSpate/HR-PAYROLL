import { modules, resolveModuleOrder } from '@erp/contracts';

export const navGroups = resolveModuleOrder(modules).flatMap((m) => m.nav);
