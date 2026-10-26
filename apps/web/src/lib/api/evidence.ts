import { request } from './request';

export function getEvidenceUrl(token: string, evidenceId: string) {
  return request<{ url: string; expiresAt: string }>(
    `/evidence/${evidenceId}`,
    {},
    token,
  );
}
