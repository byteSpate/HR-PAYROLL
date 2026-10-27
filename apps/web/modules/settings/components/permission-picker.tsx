'use client';

import { Checkbox } from '@erp/ui/components/checkbox';
import { Label } from '@erp/ui/components/label';
import type { RoleGrant, Scope } from '../api';
import { usePermissionGroups } from '../hooks';

export function PermissionPicker({ value, onChange }: { value: RoleGrant[]; onChange: (next: RoleGrant[]) => void }) {
  const { data, error, isPending } = usePermissionGroups();

  if (isPending) return <p className="text-sm text-muted-foreground">Loading permissions…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const held = (key: string) => value.find((g) => g.permissionKey === key);
  // A scoped permission starts at its narrowest scope; the select widens it.
  const toggle = (key: string, scopes: Scope[], on: boolean) =>
    onChange(on ? [...value, { permissionKey: key, scope: scopes[0] ?? null }] : value.filter((g) => g.permissionKey !== key));
  const setScope = (key: string, scope: Scope) =>
    onChange(value.map((g) => (g.permissionKey === key ? { ...g, scope } : g)));

  return (
    <div className="grid gap-4">
      {data.map((group) => (
        <fieldset key={group.module} className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold capitalize">{group.module}</legend>
          {group.permissions.map((p) => {
            const grant = held(p.key);
            return (
              <Label key={p.key} className="font-normal">
                <Checkbox checked={!!grant} onCheckedChange={(on) => toggle(p.key, p.scopes, on === true)} />
                <span>{p.label}</span>
                <code className="text-xs text-muted-foreground">{p.key}</code>
                {grant && p.scopes.length > 0 ? (
                  <select
                    aria-label={`Scope for ${p.label}`}
                    value={grant.scope ?? p.scopes[0]}
                    onChange={(e) => setScope(p.key, e.target.value as Scope)}
                  >
                    {p.scopes.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : null}
              </Label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
