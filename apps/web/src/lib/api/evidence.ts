import { request } from './request';

export function getEvidenceUrl(evidenceId: string) {
  return request<{ url: string; expiresAt: string }>(`/evidence/${evidenceId}`);
}
