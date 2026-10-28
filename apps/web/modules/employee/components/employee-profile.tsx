'use client';

import type { EmployeeView } from '@erp/contracts/employee';
import { Button } from '@erp/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@erp/ui/components/card';
import { Input } from '@erp/ui/components/input';
import { Label } from '@erp/ui/components/label';
import { DATE_FIELDS, FIELD_LABELS, humanize } from '../labels';
import { EmployeeAvatar } from './avatar';

type Patch = Record<string, string | null>;

interface Field {
  name: string;
  value: string | null;
}

// Department and manager are edited on the HR form (they need pickers), not inline here.
const PICKER_FIELDS = new Set(['departmentId', 'reportingManagerId', 'employmentType']);

function sectionsOf(e: EmployeeView): { title: string; fields: Field[] }[] {
  const sections = [
    {
      title: 'Work',
      fields: [
        { name: 'fullName', value: e.work.fullName },
        { name: 'designation', value: e.work.designation },
        { name: 'departmentId', value: e.work.department.name },
        { name: 'reportingManagerId', value: e.work.reportingManager?.fullName ?? null },
        { name: 'email', value: e.work.email },
        { name: 'phone', value: e.work.phone },
      ],
    },
  ];
  if (e.employment) {
    sections.push({
      title: 'Employment',
      fields: [
        { name: 'employmentType', value: humanize(e.employment.employmentType) },
        { name: 'employmentStatus', value: humanize(e.employment.employmentStatus) },
        { name: 'joiningDate', value: e.employment.joiningDate },
        { name: 'officeLocation', value: e.employment.officeLocation },
        { name: 'lastWorkingDay', value: e.employment.lastWorkingDay },
        { name: 'exitReason', value: e.employment.exitReason ? humanize(e.employment.exitReason) : null },
      ],
    });
  }
  if (e.personal) {
    sections.push({ title: 'Personal', fields: Object.entries(e.personal).map(([name, value]) => ({ name, value })) });
  }
  if (e.money) {
    sections.push({ title: 'Bank', fields: Object.entries(e.money).map(([name, value]) => ({ name, value })) });
  }
  return sections;
}

/**
 * Renders only the sections the server sent and an input only for fields it said are editable,
 * so the page can never show more than the viewer's tier allows.
 */
export function EmployeeProfileView({
  employee,
  saving,
  error,
  onSave,
}: {
  employee: EmployeeView;
  saving: boolean;
  error: string | null;
  onSave: (patch: Patch) => void;
}) {
  const editable = new Set(employee.editableFields.filter((f) => !PICKER_FIELDS.has(f)));
  const sections = sectionsOf(employee);
  const original = new Map(sections.flatMap((s) => s.fields.map((f) => [f.name, f.value] as const)));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patch: Patch = {};
    for (const name of editable) {
      const raw = String(form.get(name) ?? '').trim();
      const value = raw === '' ? null : raw;
      if (value !== (original.get(name) ?? null)) patch[name] = value;
    }
    onSave(patch);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3">
        <EmployeeAvatar name={employee.work.fullName} url={employee.work.avatarUrl} className="size-14" />
        <div>
          <p className="font-heading text-xl font-semibold">{employee.work.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {employee.work.designation} - {employee.employeeCode}
          </p>
        </div>
      </div>
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.name} className="space-y-1">
                <Label htmlFor={`field-${field.name}`}>{FIELD_LABELS[field.name] ?? field.name}</Label>
                {editable.has(field.name) ? (
                  <Input
                    id={`field-${field.name}`}
                    name={field.name}
                    type={DATE_FIELDS.has(field.name) ? 'date' : 'text'}
                    defaultValue={field.value ?? ''}
                  />
                ) : (
                  <p id={`field-${field.name}`} className="text-sm">
                    {field.value ?? '-'}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {editable.size > 0 ? (
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      ) : null}
    </form>
  );
}
