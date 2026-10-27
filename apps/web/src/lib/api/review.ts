import type { InspectionDetail, Review } from './types';
import { request } from './request';

export function getReviewQueue() {
  return request<InspectionDetail[]>('/review/queue');
}

export function reviewInspection(
  id: string,
  body: {
    action: Review['action'];
    comment?: string | null;
    reworkItemIds?: string[];
  },
) {
  return request<InspectionDetail>(`/inspections/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
