'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

// Short staleness: mutations invalidate their own queries, so this only hides other people's changes briefly.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
