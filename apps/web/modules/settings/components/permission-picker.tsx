'use client';

import { Checkbox } from '@erp/ui/components/checkbox';
import { Label } from '@erp/ui/components/label';
import { usePermissionGroups } from '../hooks';

export function PermissionPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { data, error, isPending } = usePermissionGroups();

  if (isPending) return <p className="text-sm text-muted-foreground">Loading permissions…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const toggle = (key: string, on: boolean) => onChange(on ? [...value, key] : value.filter((k) => k !== key));

  return (
    <div className="grid gap-4">
      {data.map((group) => (
        <fieldset key={group.module} className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold capitalize">{group.module}</legend>
          {group.permissions.map((p) => (
            <Label key={p.key} className="font-normal">
              <Checkbox checked={value.includes(p.key)} onCheckedChange={(on) => toggle(p.key, on === true)} />
              <span>{p.label}</span>
              <code className="text-xs text-muted-foreground">{p.key}</code>
            </Label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
