import type { Session, User } from './types';
import { request } from './request';

export function login(email: string, password: string) {
  return request<Session>('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function deleteSession() {
  return request<void>('/auth/session', { method: 'DELETE' });
}

export function getMe() {
  return request<User>('/me');
}
