import type { Session, User } from './types';
import { request } from './request';

export function login(email: string, password: string) {
  return request<Session>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(token: string) {
  return request<User>('/me', {}, token);
}
