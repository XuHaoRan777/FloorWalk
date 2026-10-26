import { ApiError } from './errors';

const baseUrl = (
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ??
  'http://127.0.0.1:3018/api'
).replace(/\/$/, '');

export function logRaw(label: string, detail: Record<string, unknown>) {
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

export function isNetworkFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (/FormData|BodyInit/i.test(error.message)) return false;
  return (
    error instanceof TypeError || error.message.startsWith('fetch failed:')
  );
}

export function getMessage(status: number, code?: string) {
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

export async function request<T>(
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
