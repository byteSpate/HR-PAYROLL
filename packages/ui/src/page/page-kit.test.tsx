// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';
import { FilterBar } from './filter-bar';
import { FilterChip } from './filter-chip';
import { PageHeader } from './page-header';
import { SegmentedToggle } from './segmented-toggle';
import { StatCard } from './stat-card';
import { Tag } from './tag';
import { tones, type Tone } from './tones';
import { UserAvatar } from './user-avatar';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders the kicker, title and sub', () => {
    render(<PageHeader kicker="Employees" title="All employees" sub="42 people" />);
    expect(screen.getByText('Employees')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'All employees' })).toBeTruthy();
    expect(screen.getByText('42 people')).toBeTruthy();
  });

  it('renders no button without a cta', () => {
    render(<PageHeader kicker="Employees" title="All employees" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders a link when ctaHref is given', () => {
    render(<PageHeader kicker="Employees" title="All employees" cta="Add employee" ctaHref="/x" />);
    expect(screen.getByRole('link', { name: 'Add employee' }).getAttribute('href')).toBe('/x');
  });

  it('fires onCta once per click', async () => {
    const onCta = vi.fn();
    render(<PageHeader kicker="Employees" title="All employees" cta="Add employee" onCta={onCta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add employee' }));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('renders the aside beside the cta', () => {
    render(<PageHeader kicker="Attendance" title="Today" aside={<span>month stepper</span>} />);
    expect(screen.getByText('month stepper')).toBeTruthy();
  });
});

describe('tones and Tag', () => {
  const keys: Tone[] = ['neutral', 'good', 'warn', 'bad', 'info'];

  it('defines all five tones', () => {
    expect(Object.keys(tones).sort()).toEqual([...keys].sort());
  });

  // jsdom normalises colours to rgb(), so compare against the browser's own parse of the token.
  const parsed = (value: string) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    return probe.style.color;
  };

  it.each(keys)('applies the %s background and colour', (tone) => {
    render(<Tag label={tone} tone={tone} />);
    const tag = screen.getByText(tone);
    expect(tag.style.backgroundColor).toBe(parsed(tones[tone].bg));
    expect(tag.style.color).toBe(parsed(tones[tone].color));
  });
});

describe('StatCard', () => {
  it('is a link when it has an href', () => {
    render(<StatCard label="Headcount" value={42} href="/employees" />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/employees');
  });

  it('is not a link without an href', () => {
    render(<StatCard label="Headcount" value={42} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('shows the hint', () => {
    render(<StatCard label="Late" value="3" hint="this month" />);
    expect(screen.getByText('this month')).toBeTruthy();
  });
});

describe('UserAvatar', () => {
  it('falls back to first and last initials when there is no photo', () => {
    render(<UserAvatar name="Amina Rahman" />);
    expect(screen.getByText('AR')).toBeTruthy();
  });

  it('uses the first two letters of a single name', () => {
    render(<UserAvatar name="Bilal" />);
    expect(screen.getByText('BI')).toBeTruthy();
  });

  it('shows a question mark for a blank name', () => {
    render(<UserAvatar name="   " />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('renders the photo when a url is given', () => {
    const { container } = render(<UserAvatar name="Amina Rahman" avatarUrl="/a.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/a.png');
  });
});

describe('FilterChip and SegmentedToggle', () => {
  it('reports the pressed state and fires onClick', async () => {
    const onClick = vi.fn();
    render(<FilterChip label="Engineering" count={4} active onClick={onClick} />);
    const chip = screen.getByRole('button', { name: /engineering/i });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks only the current option and reports a change', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle
        label="Queue shown"
        value="pending"
        onChange={onChange}
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'decided', label: 'Decided' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pending' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Decided' }).getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: 'Decided' }));
    expect(onChange).toHaveBeenCalledWith('decided');
  });
});

describe('FilterBar', () => {
  const bar = (active: boolean, onClear = vi.fn()) =>
    render(
      <FilterBar search="" onSearch={() => undefined} placeholder="Search people" shown={2} total={9} noun="employees" active={active} onClear={onClear} />,
    );

  it('shows the total when nothing filters, with no Clear', () => {
    bar(false);
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });

  it('shows shown-of-total and a working Clear when filtering', async () => {
    const onClear = vi.fn();
    bar(true, onClear);
    expect(screen.getByText(/of 9 employees/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('reports typing in the search box', async () => {
    const onSearch = vi.fn();
    render(<FilterBar search="" onSearch={onSearch} placeholder="Search people" shown={9} total={9} noun="employees" active={false} onClear={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Search people'), 'a');
    expect(onSearch).toHaveBeenCalledWith('a');
  });
});

describe('EmptyState', () => {
  it('shows the title, body and action', () => {
    render(<EmptyState title="No employees" body="Add the first one." action={<button type="button">Add</button>} />);
    expect(screen.getByText('No employees')).toBeTruthy();
    expect(screen.getByText('Add the first one.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('omits the body and action when not given', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
