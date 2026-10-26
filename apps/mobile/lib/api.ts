import type {
  Evidence,
  InspectionDetail,
  LoginResponse,
  TodayResponse,
  UpdateInspectionItemResponse,
  User,
} from '@libs/shared';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

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

// 开发态把原始错误打到控制台（Metro 终端、logcat）；生产包不打印。用
// console.log：console.error 在原生端弹 LogBox 红条，挡住底部按钮。Error 转成
// 字符串，让 logcat 里一条错误只占一行。
function logRaw(label: string, detail: Record<string, unknown>) {
  if (!__DEV__) return;
  const plain = Object.fromEntries(
    Object.entries(detail).map(([key, value]) => [
      key,
      value instanceof Error
        ? `${value.name}: ${value.message}${value.cause ? ` (cause: ${String(value.cause)})` : ''}`
        : value,
    ]),
  );
  console.log(`[FloorWalk API] ${label}`, JSON.stringify(plain));
}

// fetch 抛出的异常里，只有连不上服务器的才算网络错误：浏览器与 RN 的 fetch
// 抛 TypeError，expo/fetch 原生端把连接失败包成 "fetch failed: ..."。请求体
// 转换失败（如 Unsupported FormDataPart implementation）也是 "fetch failed:"
// 开头，所以先排除它。
function isNetworkFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (/FormData|BodyInit/i.test(error.message)) return false;
  return (
    error instanceof TypeError || error.message.startsWith('fetch failed:')
  );
}

function getMessage(status: number, code?: string) {
  if (code === 'NETWORK_ERROR') return '网络连接失败，请检查网络后重试。';
  if (code === 'FILE_READ_FAILED') return '读取照片失败，请重新选择照片。';
  if (code === 'CLIENT_ERROR') return '请求没有发出，请稍后重试。';
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
  } catch (error) {
    const code = isNetworkFailure(error) ? 'NETWORK_ERROR' : 'CLIENT_ERROR';
    logRaw('fetch 异常', {
      method: options.method ?? 'GET',
      path,
      code,
      error,
    });
    throw new ApiError(getMessage(0, code), 0, code);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    logRaw('接口返回错误', {
      method: options.method ?? 'GET',
      path,
      status: response.status,
      payload,
    });
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
  ) => {
    const form = new FormData();
    try {
      if (Platform.OS === 'web') {
        const blob = await fetch(uri).then((response) => response.blob());
        form.append('file', blob, fileName);
      } else {
        const file = new File(uri);
        form.append('file', file, fileName);
      }
    } catch (error) {
      logRaw('读取照片失败', { uri, fileName, error });
      throw new ApiError(
        getMessage(0, 'FILE_READ_FAILED'),
        0,
        'FILE_READ_FAILED',
      );
    }
    return request<Evidence>(
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
    if (error.status === 0) return error.message;
    return getMessage(error.status, error.code) ===
      '接口暂时不可用，请稍后重试。'
      ? error.message
      : getMessage(error.status, error.code);
  }
  logRaw('未分类异常', { error });
  return '操作失败，请稍后重试。';
}
