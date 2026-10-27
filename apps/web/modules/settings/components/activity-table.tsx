'use client';

import { Button } from '@erp/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp/ui/components/table';
import { describeChange } from '../activity-format';
import { useAudit } from '../hooks';

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ActivityTable() {
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useAudit();
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  if (isPending) return <p className="text-sm text-muted-foreground">Loading activity...</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>What</TableHead>
            <TableHead>Changes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{when.format(new Date(row.changedAt))}</TableCell>
              <TableCell>{row.actorEmail ?? 'System'}</TableCell>
              <TableCell>
                {row.entity} {row.action}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {describeChange(row.before, row.after).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasNextPage ? (
        <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}
