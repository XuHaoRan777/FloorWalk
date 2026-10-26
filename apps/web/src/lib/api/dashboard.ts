import type { DashboardSite } from './types';
import { request } from './request';

export function getDashboard(token: string) {
  return request<DashboardSite[]>('/dashboard/sites', {}, token);
}
