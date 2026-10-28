import { Checkbox } from '@erp/ui/components/checkbox';
import { Label } from '@erp/ui/components/label';
import type { PermissionGroup, RoleGrant, Scope } from '../api';

// own and team are implicit for every holder, so they are never offered as a choice.
const IMPLICIT: readonly Scope[] = ['own', 'team'];
const OFF = 'off';

const labelOf = (scope: Scope) => scope.charAt(0).toUpperCase() + scope.slice(1);

interface Props {
  groups: PermissionGroup[];
  value: RoleGrant[];
  onChange: (next: RoleGrant[]) => void;
}

export function PermissionPickerView({ groups, value, onChange }: Props) {
  const held = (key: string) => value.find((g) => g.permissionKey === key);
  const without = (key: string) => value.filter((g) => g.permissionKey !== key);
  const setOnOff = (key: string, on: boolean) =>
    onChange(on ? [...without(key), { permissionKey: key, scope: null }] : without(key));
  const setScope = (key: string, choice: string) =>
    onChange(choice === OFF ? without(key) : [...without(key), { permissionKey: key, scope: choice as Scope }]);

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <fieldset key={group.module} className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold capitalize">{group.module}</legend>
          {group.permissions.map((p) => {
            const grant = held(p.key);
            const choices = p.scopes.filter((s) => !IMPLICIT.includes(s));
            if (p.scopes.length === 0) {
              return (
                <Label key={p.key} className="font-normal">
                  <Checkbox checked={!!grant} onCheckedChange={(on) => setOnOff(p.key, on === true)} />
                  <span>{p.label}</span>
                  <code className="text-xs text-muted-foreground">{p.key}</code>
                </Label>
              );
            }
            return (
              <div key={p.key} className="flex items-center gap-2 text-sm">
                <label htmlFor={`scope-${p.key}`}>{p.label}</label>
                <code className="text-xs text-muted-foreground">{p.key}</code>
                <select
                  id={`scope-${p.key}`}
                  className="ml-auto rounded-md border bg-background px-2 py-1 text-sm"
                  value={grant?.scope && choices.includes(grant.scope) ? grant.scope : OFF}
                  onChange={(e) => setScope(p.key, e.target.value)}
                >
                  <option value={OFF}>Off</option>
                  {choices.map((s) => (
                    <option key={s} value={s}>
                      {labelOf(s)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {group.permissions.some((p) => p.scopes.length > 0) ? (
            <p className="text-xs text-muted-foreground">
              Everyone can act on their own records; managers act on their team automatically
            </p>
          ) : null}
        </fieldset>
      ))}
    </div>
  );
}
