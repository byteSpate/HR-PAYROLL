'use client';

import { useDeferredValue, useState } from 'react';
import { Card, CardContent } from '@erp/ui/components/card';
import { Input } from '@erp/ui/components/input';
import { EmptyState, PageHeader } from '@erp/ui/page';
import { EmployeeAvatar } from '@/modules/employee/components/avatar';
import { useDirectory } from '@/modules/employee/hooks';

export default function DirectoryPage() {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const people = useDirectory(query, '');

  return (
    <div className="space-y-4">
      <PageHeader kicker="My Space" title="Directory" />
      <Input placeholder="Search by name, code or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      {people.isPending ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {people.error ? <p className="text-sm text-destructive">{people.error.message}</p> : null}
      {people.data?.length === 0 ? <EmptyState title="Nobody matches" body="Try a different name, code or email." /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.data?.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-start gap-3">
              <EmployeeAvatar name={p.work.fullName} url={p.work.avatarUrl} />
              <div className="min-w-0 text-sm">
                <p className="font-medium">{p.work.fullName}</p>
                <p className="text-muted-foreground">
                  {p.work.designation}, {p.work.department.name}
                </p>
                <p className="truncate">{p.work.email}</p>
                {p.work.phone ? <p>{p.work.phone}</p> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
