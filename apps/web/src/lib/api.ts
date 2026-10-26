export type {
  Role,
  User,
  Session,
  InspectionItem,
  Evidence,
  Review,
  InspectionDetail,
  DashboardSite,
} from './api/types';
export { ApiError, UnauthorizedError } from './api/errors';
export { sessionStorageKey, unauthorizedEvent } from './api/request';
export { readSession, writeSession, clearSession } from './api/session';
export { login, getMe } from './api/auth';
export { getInspection } from './api/inspection';
export { getEvidenceUrl } from './api/evidence';
export { getReviewQueue, reviewInspection } from './api/review';
export { getDashboard } from './api/dashboard';

import { login, getMe } from './api/auth';
import { getInspection } from './api/inspection';
import { getEvidenceUrl } from './api/evidence';
import { getReviewQueue, reviewInspection } from './api/review';
import { getDashboard } from './api/dashboard';

export const api = {
  login,
  getMe,
  getInspection,
  getEvidenceUrl,
  getReviewQueue,
  reviewInspection,
  getDashboard,
};
