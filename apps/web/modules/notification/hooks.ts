'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

const KEY = ['notifications'] as const;

// There is no push channel yet, so the bell asks again each minute.
export const POLL_MS = 60_000;

export const useUnreadCount = () =>
  useQuery({ queryKey: [...KEY, 'unread-count'], queryFn: api.unreadCount, refetchInterval: POLL_MS });

// Only fetched while the list is open: the count above is all the closed bell needs.
export const useNotificationList = (enabled: boolean) =>
  useQuery({ queryKey: [...KEY, 'list'], queryFn: () => api.listNotifications({ limit: 15 }), enabled });

function useRefreshing<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  // Forward only the variable: React Query also passes a context object, which the api functions do not take.
  return useMutation({ mutationFn: (args: TArgs) => fn(args), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export const useMarkRead = () => useRefreshing(api.markRead);
export const useMarkAllRead = () => useRefreshing((_: void) => api.markAllRead());
