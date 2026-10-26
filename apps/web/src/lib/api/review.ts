import type { InspectionDetail, Review } from './types';
import { request } from './request';

export function getReviewQueue(token: string) {
  return request<InspectionDetail[]>('/review/queue', {}, token);
}

export function reviewInspection(
  token: string,
  id: string,
  body: {
    action: Review['action'];
    comment?: string | null;
    reworkItemIds?: string[];
  },
) {
  return request<InspectionDetail>(
    `/inspections/${id}/review`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );
}
