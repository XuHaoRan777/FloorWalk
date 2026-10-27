import { UnauthorizedError, ApiError } from './errors';

const apiBase = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://127.0.0.1:3018/api'
).replace(/\/$/, '');
export const unauthorizedEvent = 'floorwalk:unauthorized';

function messageFor(status: number, message?: string) {
  if (message) return message;
  if (status === 401) return '登录凭证无效，请重新登录。';
  if (status === 403) return '当前账号没有权限执行此操作。';
  if (status === 409) return '当前巡检单状态已变化，请刷新后重试。';
  if (status === 422) return '提交内容不完整，请检查后重试。';
  return '网络或服务异常，请稍后重试。';
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查网络后重试。');
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as { message?: string })
    : undefined;
  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event(unauthorizedEvent));
      throw new UnauthorizedError(messageFor(401, body?.message));
    }
    throw new ApiError(
      response.status,
      messageFor(response.status, body?.message),
    );
  }
  return body as T;
}
