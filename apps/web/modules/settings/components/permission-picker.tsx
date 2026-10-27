'use client';

import type { RoleGrant } from '../api';
import { usePermissionGroups } from '../hooks';
import { PermissionPickerView } from './permission-picker-view';

export function PermissionPicker({ value, onChange }: { value: RoleGrant[]; onChange: (next: RoleGrant[]) => void }) {
  const { data, error, isPending } = usePermissionGroups();

  if (isPending) return <p className="text-sm text-muted-foreground">Loading permissions…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  return <PermissionPickerView groups={data} value={value} onChange={onChange} />;
}
