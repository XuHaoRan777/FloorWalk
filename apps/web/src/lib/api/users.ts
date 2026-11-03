import type {
  AdminUser,
  AdminUsersResponse,
  ChangePasswordRequest,
  CreateUserRequest,
  ResetUserPasswordRequest,
  UpdateUserRequest,
} from '@libs/shared';
import { request } from './request';

export const getAdminUsers = () => request<AdminUsersResponse>('/admin/users');

export const createAdminUser = (input: CreateUserRequest) =>
  request<AdminUser>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateAdminUser = (id: string, input: UpdateUserRequest) =>
  request<AdminUser>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const resetAdminUserPassword = (
  id: string,
  input: ResetUserPasswordRequest,
) =>
  request<void>(`/admin/users/${id}/password`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const changePassword = (input: ChangePasswordRequest) =>
  request<void>('/me/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
