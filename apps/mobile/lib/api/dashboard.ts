import type {
  AdminTodayResponse,
  DashboardPeriod,
  DashboardPeriodResponse,
  DashboardSitesResponse,
  SelfCheckStatsQuery,
  SelfCheckStatsResponse,
} from '@libs/shared';
import { request } from './request';

export const getAdminToday = () =>
  request<AdminTodayResponse>('/dashboard/today');

export const getDashboardSites = () =>
  request<DashboardSitesResponse>('/dashboard/sites');

export const getPeriodDashboard = (period: DashboardPeriod) =>
  request<DashboardPeriodResponse>(
    `/dashboard/period?${new URLSearchParams({ period })}`,
  );

export const getSelfCheckStats = (query: SelfCheckStatsQuery) =>
  request<SelfCheckStatsResponse>(
    `/stats/self-check?${new URLSearchParams(query)}`,
  );
