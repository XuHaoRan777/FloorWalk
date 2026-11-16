import type { DashboardSite } from './types';
import { request } from './request';
import type {
  AdminTodayResponse,
  DashboardPeriod,
  DashboardPeriodResponse,
  SelfCheckStatsQuery,
  SelfCheckStatsResponse,
} from '@libs/shared';

export function getAdminToday() {
  return request<AdminTodayResponse>('/dashboard/today');
}

export function getDashboard() {
  return request<DashboardSite[]>('/dashboard/sites');
}

export function getPeriodDashboard(period: DashboardPeriod) {
  return request<DashboardPeriodResponse>(
    `/dashboard/period?${new URLSearchParams({ period })}`,
  );
}

export function getSelfCheckStats(query: SelfCheckStatsQuery) {
  return request<SelfCheckStatsResponse>(
    `/stats/self-check?${new URLSearchParams(query)}`,
  );
}
