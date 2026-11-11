import type {
  AddScheduleSkipsRequest,
  AdminAiStandardsResponse,
  AdminSitesResponse,
  AdminTemplatesResponse,
  AdminSchedule,
  AdminSiteSchedule,
  AssignScheduleRequest,
  AiStandard,
  CreateAiStandardRequest,
  QuickSetupTemplateRequest,
  QuickSetupTemplateResponse,
  Site,
  ScheduleDefinition,
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

export const getAdminSchedules = () =>
  request<AdminSchedule[]>('/admin/schedules');
export const createAdminSchedule = (input: ScheduleDefinition) =>
  request<AdminSchedule>('/admin/schedules', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateAdminSchedule = (id: string, input: ScheduleDefinition) =>
  request<AdminSchedule>(`/admin/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const deleteAdminSchedule = (id: string) =>
  request<void>(`/admin/schedules/${id}`, { method: 'DELETE' });
export const getAdminSiteSchedules = () =>
  request<AdminSiteSchedule[]>('/admin/site-schedules');
export const assignAdminSiteSchedule = (input: AssignScheduleRequest) =>
  request<AdminSiteSchedule[]>('/admin/site-schedules', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const addAdminSiteScheduleSkips = (input: AddScheduleSkipsRequest) =>
  request<AdminSiteSchedule[]>('/admin/site-schedules/skips', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const deleteAdminSiteScheduleSkip = (id: string) =>
  request<void>(`/admin/site-schedules/skips/${id}`, { method: 'DELETE' });
