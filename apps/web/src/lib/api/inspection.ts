import type { InspectionDetail } from './types';
import { request } from './request';

export function getInspection(id: string) {
  return request<InspectionDetail>(`/inspections/${id}`);
}
