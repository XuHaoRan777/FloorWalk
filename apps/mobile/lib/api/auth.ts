import type {
  ChangePasswordRequest,
  LoginResponse,
  RequestEmailCodeResponse,
  ResetPasswordRecoveryRequest,
  User,
  VerifyPasswordRecoveryCodeResponse,
} from '@libs/shared';
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

export const requestPasswordRecoveryCode = (email: string) =>
  request<RequestEmailCodeResponse>('/auth/password-recovery-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const verifyPasswordRecoveryCode = (email: string, code: string) =>
  request<VerifyPasswordRecoveryCodeResponse>(
    '/auth/password-recovery/verify',
    {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    },
  );

export const resetPasswordRecovery = (input: ResetPasswordRecoveryRequest) =>
  request<void>('/auth/password-recovery/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });
