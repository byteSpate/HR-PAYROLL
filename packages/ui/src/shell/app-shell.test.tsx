// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NavGroup } from '@erp/contracts';
import { AppShell } from './app-shell';

let pathname = '/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

// jsdom has no matchMedia; the sidebar reads it to choose between the docked and drawer layouts.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  pathname = '/dashboard';
});

const groups: NavGroup[] = [
  {
    label: 'Overview',
    order: 10,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'RiDashboardLine', permission: null },
      {
        label: 'Attendance',
        href: '/attendance',
        icon: 'RiTimeLine',
        permission: null,
        children: [
          { label: 'Attendance Approvals', href: '/attendance/approvals', permission: null },
          { label: "Today's Attendance", href: '/attendance', permission: null },
        ],
      },
    ],
  },
  { label: 'Administration', order: 900, items: [{ label: 'Users', href: '/settings/users', icon: 'RiUserLine', permission: null }] },
];

const identity = { name: 'Amina Rahman', email: 'amina@example.com', subtitle: 'HR Admin', roleLabel: 'HR Admin' };

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const onSignOut = vi.fn();
  render(
    <AppShell
      navGroups={groups}
      rootHref="/dashboard"
      profileHref="/me"
      brand={<span>logo</span>}
      identity={identity}
      onSignOut={onSignOut}
      {...overrides}
    >
      <p>page body</p>
    </AppShell>,
  );
  return { onSignOut };
}

describe('AppShell', () => {
  it('renders children inside the only <main>, capped like the original', () => {
    renderShell();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]!.contains(screen.getByText('page body'))).toBe(true);
    expect(mains[0]!.className).toContain('max-w-[1220px]');
  });

  it('shows the brand, the headings, and the header slot', () => {
    renderShell({ headerSlot: <span>bell</span> });
    expect(screen.getByText('logo')).toBeTruthy();
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Administration')).toBeTruthy();
    expect(screen.getByText('bell')).toBeTruthy();
  });

  it('retires the hamburger at the lg breakpoint', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Open menu' }).className).toContain('lg:hidden');
  });

  it('signs out once from the sidebar footer', async () => {
    const { onSignOut } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('signs out once from the account menu', async () => {
    const { onSignOut } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: /account menu for amina rahman/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('collapsible sidebar items', () => {
  it('starts closed, then expands into its pages when clicked, without navigating', async () => {
    renderShell();
    expect(screen.queryByRole('link', { name: 'Attendance Approvals' })).toBeNull();
    const parent = screen.getByRole('button', { name: /attendance/i });
    expect(parent.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(parent);
    expect(parent.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Attendance Approvals' }).getAttribute('href')).toBe('/attendance/approvals');
    expect(screen.getByRole('link', { name: "Today's Attendance" }).getAttribute('href')).toBe('/attendance');
  });

  it('opens by itself when the current page is one of its children', () => {
    pathname = '/attendance/approvals';
    renderShell();
    expect(screen.getByRole('button', { name: /attendance/i }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Attendance Approvals' })).toBeTruthy();
  });

  it('marks only the current page active, so a nested route does not light two', () => {
    pathname = '/attendance/approvals';
    renderShell();
    const active = screen.getAllByRole('link').filter((l) => l.getAttribute('data-active') !== null && l.getAttribute('data-active') !== 'false');
    expect(active.map((l) => l.textContent)).toEqual(['Attendance Approvals']);
  });
});
