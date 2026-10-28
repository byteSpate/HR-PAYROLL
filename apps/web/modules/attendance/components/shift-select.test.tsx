// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { ShiftSelect } from './shift-select';

// A factory rather than automock: automocking would still import the real module and its '@/' alias.
vi.mock('../api', () => ({ configList: vi.fn() }));

const row = (over: Record<string, unknown>) => ({ id: 'x', name: 'x', startTime: '09:00', endTime: '18:00', effectiveFrom: null, ...over });

function renderSelect() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <form data-testid="form">
        <ShiftSelect />
      </form>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ShiftSelect', () => {
  it('offers the default hours first, then each standing shift with its times', async () => {
    vi.mocked(api.configList).mockResolvedValue([row({ id: 's1', name: 'Standard' }), row({ id: 's2', name: 'Late', startTime: '11:00', endTime: '20:00' })] as never);
    renderSelect();
    const select = (await screen.findByLabelText('Shift')) as HTMLSelectElement;
    await screen.findByRole('option', { name: 'Standard (09:00-18:00)' });
    expect([...select.options].map((o) => o.textContent)).toEqual(['Default hours (09:00-18:00)', 'Standard (09:00-18:00)', 'Late (11:00-20:00)']);
    expect(select.name).toBe('shiftId');
    expect(select.value).toBe('');
  });

  it('leaves dated overrides out, because they apply to everyone automatically', async () => {
    vi.mocked(api.configList).mockResolvedValue([row({ id: 's1', name: 'Standard' }), row({ id: 's2', name: 'Ramadan', effectiveFrom: '2026-03-01' })] as never);
    renderSelect();
    await screen.findByRole('option', { name: 'Standard (09:00-18:00)' });
    expect(screen.queryByRole('option', { name: /ramadan/i })).toBeNull();
  });

  it('still lets the form submit the default when the list cannot load', async () => {
    vi.mocked(api.configList).mockRejectedValue(new Error('Forbidden'));
    renderSelect();
    const select = (await screen.findByLabelText('Shift')) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.options).toHaveLength(1);
  });
});
