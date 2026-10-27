import type { LoginResponse, User } from '@libs/shared';
import { request } from './request';

export const login = (email: string, password: string) =>
  request<LoginResponse>('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const logout = () =>
  request<void>('/auth/session', { method: 'DELETE' });

export const me = () => request<User>('/me');
