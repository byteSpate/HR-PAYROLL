import type { Db } from '@erp/db';

// Grants a user holds because of facts rather than their role, such as a manager's `team`
// scope from having direct reports. Modules register providers; core knows none.
export type GrantProvider = (db: Db, userId: string) => Promise<string[]>;

const providers: GrantProvider[] = [];

/** Returns a function that unregisters the provider again (used by tests). */
export function registerGrantProvider(provider: GrantProvider): () => void {
  providers.push(provider);
  return () => {
    providers.splice(providers.indexOf(provider), 1);
  };
}

export async function derivedGrants(db: Db, userId: string): Promise<string[]> {
  const lists = await Promise.all(providers.map((p) => p(db, userId)));
  return lists.flat();
}
