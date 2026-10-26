import type { LoginResponse, User } from '@libs/shared';
import { request } from './request';

export const login = (email: string, password: string) =>
  request<LoginResponse>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const me = (token: string) => request<User>('/me', token);
