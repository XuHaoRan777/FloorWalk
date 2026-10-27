import type { DashboardSite } from './types';
import { request } from './request';

export function getDashboard() {
  return request<DashboardSite[]>('/dashboard/sites');
}
