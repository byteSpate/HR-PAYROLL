// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ManualPage } from './components/manual-page';
vi.mock('./api', () => ({ manual: vi.fn() }));
afterEach(cleanup);
it('shows a manual entry form', () => {
  render(<QueryClientProvider client={new QueryClient()}><ManualPage /></QueryClientProvider>);
  expect(screen.getByRole('button', { name: 'Save entry' })).toBeTruthy();
});
