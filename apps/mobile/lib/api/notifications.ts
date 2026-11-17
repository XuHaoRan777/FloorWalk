import type { Notification } from '@libs/shared';
import { request } from './request';

export type NotificationsPage = {
  notifications: Notification[];
  nextCursor: string | null;
};

export function getNotifications(after?: string) {
  const query = new URLSearchParams();
  if (after) query.set('after', after);
  query.set('unread_only', 'false');
  return request<NotificationsPage>(`/me/notifications?${query}`);
}

export function getUnreadNotificationCount() {
  return request<{ count: number }>('/me/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return request<void>(`/me/notifications/${id}/read`, { method: 'POST' });
}
