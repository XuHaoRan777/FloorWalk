import type { InspectionDetail } from './types';
import { request } from './request';

export function getInspection(token: string, id: string) {
  return request<InspectionDetail>(`/inspections/${id}`, {}, token);
}
