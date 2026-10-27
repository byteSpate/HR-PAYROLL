'use client';

import { useRoleOptions } from '../hooks';

export function RoleSelect({
  value,
  onChange,
  disabled,
  label = 'Role',
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { data, error, isPending } = useRoleOptions();

  if (isPending) return <p className="text-sm text-muted-foreground">Loading roles…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  return (
    <select
      aria-label={label}
      className="rounded-md border bg-background px-2 py-1.5 text-sm"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">No role</option>
      {data.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  );
}
