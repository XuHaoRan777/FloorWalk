import type {
  AdminAiStandardsResponse,
  AdminSitesResponse,
  AdminTemplatesResponse,
  AiStandard,
  CreateAiStandardRequest,
  QuickSetupTemplateRequest,
  QuickSetupTemplateResponse,
  Site,
  TemplateItem,
  UpdateAiStandardRequest,
} from '@libs/shared';
import { request } from './request';

export const getAdminSites = () => request<AdminSitesResponse>('/admin/sites');
export const createAdminSite = (input: { code: string; name: string }) =>
  request<Site>('/admin/sites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateAdminSite = (
  id: string,
  input: { name?: string; active?: boolean },
) =>
  request<Site>(`/admin/sites/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export type AdminTemplate = AdminTemplatesResponse[number];
export type NewTemplateItem = Pick<
  TemplateItem,
  'title' | 'minPhotoCount' | 'acceptanceCriteria' | 'critical'
>;
export type UpdatedTemplateItem = NewTemplateItem & { position: number };
type TemplateInput = {
  name: string;
  aiEnabled: boolean;
  aiStandardId: string | null;
};

export const getAdminTemplates = () =>
  request<AdminTemplatesResponse>('/admin/templates');
export const createAdminTemplate = (
  input: TemplateInput & { items: NewTemplateItem[] },
) =>
  request<AdminTemplate>('/admin/templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateAdminTemplate = (
  id: string,
  input: TemplateInput & { items: UpdatedTemplateItem[] },
) =>
  request<AdminTemplate>(`/admin/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const quickSetupAdminTemplate = (input: QuickSetupTemplateRequest) =>
  request<QuickSetupTemplateResponse>('/admin/templates/quick-setup', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const getAdminAiStandards = () =>
  request<AdminAiStandardsResponse>('/admin/ai-standards');
export const createAdminAiStandard = (input: CreateAiStandardRequest) =>
  request<AiStandard>('/admin/ai-standards', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateAdminAiStandard = (
  id: string,
  input: UpdateAiStandardRequest,
) =>
  request<AiStandard>(`/admin/ai-standards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
