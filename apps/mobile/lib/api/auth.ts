import type {
  AvatarUploadResponse,
  ChangePasswordRequest,
  CurrentUser,
  LoginResponse,
  RequestEmailCodeResponse,
  ResetPasswordRecoveryRequest,
  UpdateMeRequest,
  VerifyPasswordRecoveryCodeResponse,
} from '@libs/shared';
import {
  avatarMimeTypes,
  avatarUploadFieldName,
  maxAvatarSizeBytes,
} from '@libs/shared';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { request } from './request';

export const login = (loginName: string, password: string, orgId?: string) =>
  request<LoginResponse>('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ loginName, password, orgId }),
  });

export const logout = () =>
  request<void>('/auth/session', { method: 'DELETE' });

export const me = () => request<CurrentUser>('/me');

export const updateMe = async (input: UpdateMeRequest) => {
  await request('/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
};

export class AvatarInputError extends Error {}

export const uploadAvatar = async (uri: string, fileName: string) => {
  const form = new FormData();
  try {
    const file =
      Platform.OS === 'web'
        ? await fetch(uri).then((response) => response.blob())
        : new File(uri);
    if (!avatarMimeTypes.some((supported) => supported === file.type)) {
      throw new AvatarInputError('仅支持 JPEG 或 PNG 头像。');
    }
    if (file.size > maxAvatarSizeBytes) {
      throw new AvatarInputError('头像不能超过 2MB。');
    }
    form.append(avatarUploadFieldName, file, fileName);
  } catch (cause) {
    if (cause instanceof AvatarInputError) throw cause;
    throw new AvatarInputError('读取头像失败，请重新选择。');
  }
  return request<AvatarUploadResponse>('/me/avatar', {
    method: 'POST',
    body: form,
  });
};

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
