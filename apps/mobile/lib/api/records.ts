import type { InspectorRecordsResponse } from '@libs/shared';
import { request } from './request';

export const inspectorRecords = (cursor?: string) => {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<InspectorRecordsResponse>(`/inspector/inspections${query}`);
};
