'use client';

import { Checkbox } from '@erp/ui/components/checkbox';
import { Label } from '@erp/ui/components/label';
import { useRoles } from '../hooks';

// Listing roles needs role.manage on the API; for a caller without it the API error is shown as-is.
export function RoleSelect({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { data, error, isPending } = useRoles();

  if (isPending) return <p className="text-sm text-muted-foreground">Loading roles…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id));

  return (
    <div className="grid gap-2">
      {data.map((role) => (
        <Label key={role.id} className="font-normal">
          <Checkbox checked={value.includes(role.id)} onCheckedChange={(on) => toggle(role.id, on === true)} />
          <span>{role.name}</span>
        </Label>
      ))}
    </div>
  );
}
