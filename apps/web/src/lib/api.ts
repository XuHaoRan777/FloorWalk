export type Role = 'inspector' | 'supervisor' | 'hq';

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  siteId: string | null;
  createdAt: string;
};

export type Session = { token: string; user: User };

export type InspectionItem = {
  id: string;
  inspectionId: string;
  position: number;
  title: string;
  photoRequired: boolean;
  critical: boolean;
  result: 'pending' | 'pass' | 'fail';
  note: string | null;
  createdAt: string;
  evidence: Evidence[];
};

export type Evidence = {
  id: string;
  inspectionItemId: string;
  storageKey: string;
  mime: string;
  size: number;
  createdAt: string;
};

export type Review = {
  id: string;
  inspectionId: string;
  reviewerId: string;
  action: 'start' | 'approve' | 'rework' | 'fail';
  comment: string | null;
  reworkItemIds: string[] | null;
  createdAt: string;
};

export type InspectionDetail = {
  id: string;
  siteId: string;
  templateId: string;
  inspectorId: string;
  status: 'draft' | 'submitted' | 'in_review' | 'passed' | 'rework' | 'failed';
  score: number | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  site: { id: string; code: string; name: string; createdAt: string };
  items: InspectionItem[];
  reviews: Review[];
};

export type DashboardSite = {
  site: { id: string; code: string; name: string; createdAt: string };
  latestScore: number | null;
  latestStatus: InspectionDetail['status'] | null;
};

const apiBase = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://127.0.0.1:3018/api'
).replace(/\/$/, '');

export const sessionStorageKey = 'floorwalk.session';
export const unauthorizedEvent = 'floorwalk:unauthorized';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string) {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export function readSession(): Session | null {
  const raw = localStorage.getItem(sessionStorageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem(sessionStorageKey);
    return null;
  }
}

export function writeSession(session: Session) {
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(sessionStorageKey);
}

function messageFor(status: number, message?: string) {
  if (message) return message;
  if (status === 401) return '登录凭证无效，请重新登录。';
  if (status === 403) return '当前账号没有权限执行此操作。';
  if (status === 409) return '当前巡检单状态已变化，请刷新后重试。';
  if (status === 422) return '提交内容不完整，请检查后重试。';
  return '网络或服务异常，请稍后重试。';
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查网络后重试。');
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as { message?: string })
    : undefined;
  if (!response.ok) {
    if (response.status === 401) {
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

export function login(email: string, password: string) {
  return request<Session>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(token: string) {
  return request<User>('/me', {}, token);
}

export function getReviewQueue(token: string) {
  return request<InspectionDetail[]>('/review/queue', {}, token);
}

export function getInspection(token: string, id: string) {
  return request<InspectionDetail>(`/inspections/${id}`, {}, token);
}

export function getEvidenceUrl(token: string, evidenceId: string) {
  return request<{ url: string; expiresAt: string }>(
    `/evidence/${evidenceId}`,
    {},
    token,
  );
}

export function reviewInspection(
  token: string,
  id: string,
  body: {
    action: Review['action'];
    comment?: string | null;
    reworkItemIds?: string[];
  },
) {
  return request<InspectionDetail>(
    `/inspections/${id}/review`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );
}

export function getDashboard(token: string) {
  return request<DashboardSite[]>('/dashboard/sites', {}, token);
}
