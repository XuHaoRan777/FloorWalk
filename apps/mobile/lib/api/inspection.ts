import type { InspectionDetail, TodayResponse } from '@libs/shared';
import { request } from './request';

export const today = () => request<TodayResponse>('/inspector/today');

export const inspection = (id: string) =>
  request<InspectionDetail>(`/inspections/${id}`);
