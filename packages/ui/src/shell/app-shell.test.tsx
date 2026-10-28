// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NavGroup } from '@erp/contracts';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/employees' }));

// jsdom has no matchMedia; the sidebar reads it to choose between the docked and drawer layouts.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const groups: NavGroup[] = [
  {
    label: 'People',
    order: 10,
    icon: 'RiGroupLine',
    items: [{ label: 'Employees', href: '/employees', icon: 'RiGroupLine', permission: null }],
  },
];

const identity = { name: 'Amina Rahman', subtitle: 'HR Admin' };

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const onSignOut = vi.fn();
  render(
    <AppShell
      groups={groups}
      access={{ accessLevel: 'ADMIN', grants: [] }}
      identity={identity}
      onSignOut={onSignOut}
      profileHref="/me"
      {...overrides}
    >
      <p>page body</p>
    </AppShell>,
  );
  return { onSignOut };
}

describe('AppShell', () => {
  it('renders children inside the only <main>', () => {
    renderShell();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]!.contains(screen.getByText('page body'))).toBe(true);
  });

  it('caps the content width like the original', () => {
    renderShell();
    expect(screen.getByRole('main').className).toContain('max-w-[1220px]');
  });

  it('renders the header slot', () => {
    renderShell({ headerSlot: <span>bell</span> });
    expect(screen.getByText('bell')).toBeTruthy();
  });

  it('retires the hamburger at the lg breakpoint', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Open menu' }).className).toContain('lg:hidden');
  });

  it('shows the name and subtitle on the account chip', () => {
    renderShell();
    const chip = screen.getByRole('button', { name: /account menu for amina rahman/i });
    expect(chip.textContent).toContain('Amina Rahman');
    expect(chip.textContent).toContain('HR Admin');
  });

  it('signs out once from the account menu', async () => {
    const { onSignOut } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: /account menu for/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
