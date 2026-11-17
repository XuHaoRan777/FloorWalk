import type { User } from './types';
import {
  avatarUploadFieldName,
  type AvatarUploadResponse,
  type ChangePasswordRequest,
  type CurrentUser,
  type LoginResponse,
  type UpdateMeRequest,
} from '@libs/shared';
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
  return request<CurrentUser>('/me');
}

export function updateMe(input: UpdateMeRequest) {
  return request<User>('/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function uploadAvatar(file: File) {
  const body = new FormData();
  body.append(avatarUploadFieldName, file);
  return request<AvatarUploadResponse>('/me/avatar', { method: 'POST', body });
}

export function changePassword(input: ChangePasswordRequest) {
  return request<void>('/me/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
