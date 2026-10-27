'use client';

import { Checkbox } from '@erp/ui/components/checkbox';
import { Label } from '@erp/ui/components/label';
import { useRoleOptions } from '../hooks';

export function RoleSelect({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  const { data, error, isPending } = useRoleOptions();

  if (isPending) return <p className="text-sm text-muted-foreground">Loading roles…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  return (
    <div className="grid gap-2">
      {data.map((role) => (
        <Label key={role.id} className="font-normal">
          <Checkbox checked={value === role.id} onCheckedChange={(on) => onChange(on === true ? role.id : null)} />
          <span>{role.name}</span>
        </Label>
      ))}
    </div>
  );
}
