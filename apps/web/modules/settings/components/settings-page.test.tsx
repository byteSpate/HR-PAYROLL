// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';

const push = vi.fn();
let grants: string[] = [];

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/session', () => ({ useSession: () => ({ user: { accessLevel: 'STANDARD', grants } }) }));
// The tabs come from the same nav the sidebar draws, so the page and the sidebar can never disagree.
vi.mock('@/lib/nav', () => ({
  navGroups: [
    {
      label: 'Administration',
      order: 900,
      items: [
        {
          label: 'Settings',
          href: '/settings/departments',
          icon: 'RiSettingsLine',
          permission: null,
          children: [
            { label: 'Departments', href: '/settings/departments', permission: 'department.manage', icon: 'RiBuilding2Line' },
            { label: 'Shifts', href: '/settings/shifts', permission: 'attendance.config', icon: 'RiTimeLine' },
            { label: 'Leave types', href: '/settings/leave-types', permission: 'leave.config', icon: 'RiCalendarCheckLine' },
          ],
        },
      ],
    },
  ],
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  grants = [];
});

describe('SettingsPage', () => {
  it('shows a tab for each section the person may open, and the active section below', () => {
    grants = ['department.manage', 'leave.config'];
    render(
      <SettingsPage section="/settings/departments">
        <p>departments panel</p>
      </SettingsPage>,
    );
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Departments' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Leave types' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Shifts' })).toBeNull();
    expect(screen.getByText('departments panel')).toBeTruthy();
  });

  it('moves to the other section’s own page when its tab is chosen', async () => {
    grants = ['department.manage', 'leave.config'];
    render(
      <SettingsPage section="/settings/departments">
        <p>departments panel</p>
      </SettingsPage>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Leave types' }));
    expect(push).toHaveBeenCalledWith('/settings/leave-types');
  });

  it('says so when nothing in Settings is open to the person', () => {
    render(
      <SettingsPage section="/settings/departments">
        <p>departments panel</p>
      </SettingsPage>,
    );
    expect(screen.getByText('Nothing here for you')).toBeTruthy();
    expect(screen.queryByText('departments panel')).toBeNull();
  });
});
