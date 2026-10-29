import type { InspectorRecordsResponse } from '@libs/shared';
import { request } from './request';

export const inspectorRecords = (cursor?: string) => {
  const query = cursor
    ? `?limit=10&cursor=${encodeURIComponent(cursor)}`
    : '?limit=10';
  return request<InspectorRecordsResponse>(`/inspector/inspections${query}`);
};
