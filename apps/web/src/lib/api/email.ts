import type {
  RequestEmailCodeResponse,
  ResetPasswordRecoveryRequest,
  VerifyPasswordRecoveryCodeRequest,
  VerifyPasswordRecoveryCodeResponse,
} from '@libs/shared';
import { request } from './request';

export function requestRegistrationCode(email: string) {
  return request<RequestEmailCodeResponse>('/auth/registration-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function requestPasswordRecoveryCode(email: string) {
  return request<RequestEmailCodeResponse>('/auth/password-recovery-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function verifyPasswordRecoveryCode(
  input: VerifyPasswordRecoveryCodeRequest,
) {
  return request<VerifyPasswordRecoveryCodeResponse>(
    '/auth/password-recovery/verify',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function resetPasswordRecovery(input: ResetPasswordRecoveryRequest) {
  return request<void>('/auth/password-recovery/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
