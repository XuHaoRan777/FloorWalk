import type {
  InspectorRecordsResponse,
  SignedEvidenceResponse,
} from '@libs/shared';
import { request } from './request';

export const inspectorRecords = (cursor?: string) => {
  const query = cursor
    ? `?limit=10&cursor=${encodeURIComponent(cursor)}`
    : '?limit=10';
  return request<InspectorRecordsResponse>(`/inspector/inspections${query}`);
};

export const evidenceUrl = (id: string) =>
  request<SignedEvidenceResponse>(`/evidence/${id}`);
