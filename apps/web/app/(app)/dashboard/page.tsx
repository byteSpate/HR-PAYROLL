'use client';

import { useSession } from '@/lib/session';

export default function DashboardPage() {
  const { user } = useSession();
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Welcome{user ? `, ${user.displayName}` : ''}.</p>
    </div>
  );
}
