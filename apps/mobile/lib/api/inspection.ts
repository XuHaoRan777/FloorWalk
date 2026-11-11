import type {
  InspectionDetail,
  InspectorTaskDetail,
  TodayResponse,
} from '@libs/shared';
import { request } from './request';

export const today = () => request<TodayResponse>('/inspector/today');

export const inspectorTask = (id: string) =>
  request<InspectorTaskDetail>(`/inspector/tasks/${id}`);

export const inspection = (id: string) =>
  request<InspectionDetail>(`/inspections/${id}`);
