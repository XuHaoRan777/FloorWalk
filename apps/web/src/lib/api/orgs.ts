import type { CreateOrgRequest, CreateOrgResponse } from '@libs/shared';
import { request } from './request';

export const createOrg = (input: CreateOrgRequest) =>
  request<CreateOrgResponse>('/orgs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
