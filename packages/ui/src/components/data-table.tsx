'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { RiArrowDownSLine, RiArrowUpSLine } from '@remixicon/react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

export type SortValue = string | number | null | undefined;

export interface DataColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Omit to make the column unsortable. */
  sortValue?: (row: T) => SortValue;
  className?: string;
}

/** Case-insensitive for text, numeric for numbers, empty values always last. Never mutates `rows`. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return String(x).localeCompare(String(y), undefined, { sensitivity: 'base', numeric: true }) * sign;
  });
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  empty?: string;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, empty = 'Nothing here yet.' }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const sorted = useMemo(() => {
    if (!sort || !rows) return rows ?? [];
    const value = columns.find((c) => c.key === sort.key)?.sortValue;
    return value ? sortRows(rows, value, sort.dir) : rows;
  }, [rows, columns, sort]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (sorted.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={c.className}>
              {c.sortValue ? (
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggle(c.key)}>
                  {c.header}
                  {sort?.key === c.key ? sort.dir === 'asc' ? <RiArrowUpSLine className="size-4" /> : <RiArrowDownSLine className="size-4" /> : null}
                </button>
              ) : (
                c.header
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={rowKey(row)}>
            {columns.map((c) => (
              <TableCell key={c.key} className={c.className}>
                {c.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
