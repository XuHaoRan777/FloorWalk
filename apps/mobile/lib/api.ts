import type {
  InspectionDetail,
  LoginResponse,
  TodayResponse,
  UpdateInspectionItemResponse,
  User,
} from '@libs/shared';

const baseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3018/api'
).replace(/\/$/);

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function getMessage(status: number, code?: string) {
  if (status === 401 || code === 'UNAUTHENTICATED')
    return '登录已失效，请重新登录。';
  if (status === 403 || code === 'FORBIDDEN')
    return '当前账号没有权限执行此操作。';
  if (status === 409 || code === 'INVALID_STATE')
    return '当前巡检状态不允许此操作。';
  if (status === 422 || code === 'INCOMPLETE' || code === 'CRITICAL_FAILED')
    return '请先完成所有检查项和必拍照片。';
  if (status === 400 || code === 'VALIDATION_FAILED')
    return '提交内容有误，请检查后重试。';
  if (status === 404 || code === 'NOT_FOUND') return '请求的数据不存在。';
  return '接口暂时不可用，请稍后重试。';
}

async function request<T>(
  path: string,
  token?: string,
  options: RequestInit = {},
) {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('网络连接失败，请检查网络后重试。', 0, 'NETWORK_ERROR');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && 'code' in payload
        ? String(payload.code)
        : undefined;
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : getMessage(response.status, code);
    throw new ApiError(
      message || getMessage(response.status, code),
      response.status,
      code,
    );
  }
  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<User>('/me', token),
  today: (token: string) => request<TodayResponse>('/inspector/today', token),
  createInspection: (token: string, templateId: string) =>
    request<{ id: string }>('/inspections', token, {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    }),
  inspection: (token: string, id: string) =>
    request<InspectionDetail>(`/inspections/${id}`, token),
  updateItem: (
    token: string,
    inspectionId: string,
    itemId: string,
    result: 'pending' | 'pass' | 'fail',
    note: string | null,
  ) =>
    request<UpdateInspectionItemResponse>(
      `/inspections/${inspectionId}/items/${itemId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ result, note }),
      },
    ),
  uploadEvidence: async (
    token: string,
    inspectionId: string,
    itemId: string,
    uri: string,
    fileName: string,
    mimeType: string,
  ) => {
    const form = new FormData();
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      const blob = await fetch(uri).then((response) => response.blob());
      form.append('file', blob, fileName);
    } else {
      form.append('file', {
        uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
    }
    return request(
      `/inspections/${inspectionId}/items/${itemId}/evidence`,
      token,
      {
        method: 'POST',
        body: form,
      },
    );
  },
  submit: (token: string, id: string) =>
    request<{ status: string; score: number | null }>(
      `/inspections/${id}/submit`,
      token,
      {
        method: 'POST',
      },
    ),
};

export function userFacingError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 0) return '网络连接失败，请检查网络后重试。';
    return getMessage(error.status, error.code) ===
      '接口暂时不可用，请稍后重试。'
      ? error.message
      : getMessage(error.status, error.code);
  }
  return '操作失败，请稍后重试。';
}
