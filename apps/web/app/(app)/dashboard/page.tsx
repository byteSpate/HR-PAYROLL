'use client';

import { PageHeader } from '@erp/ui/page';
import { useSession } from '@/lib/session';

export default function DashboardPage() {
  const { user } = useSession();
  return <PageHeader kicker="Dashboard" title={user ? `Welcome, ${user.displayName}` : 'Welcome'} />;
}
