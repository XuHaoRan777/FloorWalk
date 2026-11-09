import type { ChangePasswordRequest, LoginResponse, User } from '@libs/shared';
import { request } from './request';

export const login = (loginName: string, password: string, orgId?: string) =>
  request<LoginResponse>('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ loginName, password, orgId }),
  });

export const logout = () =>
  request<void>('/auth/session', { method: 'DELETE' });

export const me = () => request<User>('/me');

export const changePassword = (input: ChangePasswordRequest) =>
  request<void>('/me/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
