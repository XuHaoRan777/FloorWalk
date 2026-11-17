import type { Notification } from '@libs/shared';
import { request } from './request';

export function getNotifications(options: { unreadOnly?: boolean } = {}) {
  const query = new URLSearchParams({
    unread_only: String(options.unreadOnly ?? false),
  });
  return request<{ notifications: Notification[]; nextCursor: string | null }>(
    `/me/notifications?${query}`,
  );
}

export function getUnreadNotificationCount() {
  return request<{ count: number }>('/me/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return request<void>(`/me/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead() {
  return request<void>('/me/notifications/read-all', { method: 'POST' });
}
