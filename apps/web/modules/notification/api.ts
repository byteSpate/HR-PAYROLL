import type { NotificationList } from '@erp/contracts/notification';
import { api } from '@/lib/api-client';

export const listNotifications = (opts: { limit?: number; unreadOnly?: boolean } = {}) => {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.unreadOnly) params.set('unreadOnly', 'true');
  const query = params.toString();
  return api.request<NotificationList>(`/notifications${query ? `?${query}` : ''}`);
};

export const unreadCount = () => api.request<{ count: number }>('/notifications/unread-count');
export const markRead = (id: string) => api.request<void>(`/notifications/${id}/read`, { method: 'POST' });
export const markAllRead = () => api.request<{ changed: number }>('/notifications/read-all', { method: 'POST' });
