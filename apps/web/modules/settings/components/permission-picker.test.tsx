import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PermissionGroup } from '../api';
import { PermissionPickerView } from './permission-picker-view';

const groups: PermissionGroup[] = [
  {
    module: 'hr',
    permissions: [
      { key: 'employee.read', label: 'View employees', scopes: ['team', 'department', 'all'] },
      { key: 'department.manage', label: 'Manage departments', scopes: [] },
    ],
  },
];

const render = () => renderToStaticMarkup(<PermissionPickerView groups={groups} value={[]} onChange={() => undefined} />);

describe('PermissionPickerView', () => {
  it('renders a select with Off, Department and All for a scoped permission', () => {
    const html = render();
    const select = html.match(/<select[\s\S]*?<\/select>/)?.[0] ?? '';
    const options = [...select.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
    expect(options).toEqual(['Off', 'Department', 'All']);
  });

  it('renders a checkbox for an on/off permission and no select for it', () => {
    const html = render();
    expect(html).toMatch(/role="checkbox"|type="checkbox"/);
    expect(html.match(/<select/g)).toHaveLength(1);
  });

  it('explains the implicit scopes', () => {
    expect(render()).toContain('managers act on their team automatically');
  });
});
