import type { User } from './types';
import type { ChangePasswordRequest, LoginResponse } from '@libs/shared';
import { request } from './request';

export function login(loginName: string, password: string, orgId?: string) {
  return request<LoginResponse>('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ loginName, password, orgId }),
  });
}

export function deleteSession() {
  return request<void>('/auth/session', { method: 'DELETE' });
}

export function getMe() {
  return request<User>('/me');
}

export function changePassword(input: ChangePasswordRequest) {
  return request<void>('/me/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
