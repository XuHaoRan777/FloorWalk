import type {
  AddScheduleSkipsRequest,
  AdminSchedule,
  AdminSite,
  AdminSiteSchedule,
  AdminTemplatesResponse,
  AdminUser,
  AssignScheduleRequest,
  AiStandard,
  CreateAiStandardRequest,
  CreateUserRequest,
  QuickSetupTemplateRequest,
  QuickSetupTemplateResponse,
  ScheduleDefinition,
  Site,
  TemplateItem,
  UpdateAiStandardRequest,
  UpdateUserRequest,
} from '@libs/shared';
import { request } from './request';

export type AdminTemplate = AdminTemplatesResponse[number];
type TemplateInput = Pick<AdminTemplate, 'name' | 'aiEnabled' | 'aiStandardId'>;
type NewTemplateItem = Pick<
  TemplateItem,
  'title' | 'minPhotoCount' | 'acceptanceCriteria' | 'critical'
>;

export const adminApi = {
  users: () => request<AdminUser[]>('/admin/users'),
  createUser: (input: CreateUserRequest) =>
    request<AdminUser>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateUser: (id: string, input: UpdateUserRequest) =>
    request<AdminUser>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  resetPassword: (id: string, password: string) =>
    request<void>(`/admin/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  sites: () => request<AdminSite[]>('/admin/sites'),
  createSite: (input: { code: string; name: string }) =>
    request<Site>('/admin/sites', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSite: (id: string, input: { name?: string; active?: boolean }) =>
    request<Site>(`/admin/sites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  templates: () => request<AdminTemplatesResponse>('/admin/templates'),
  createTemplate: (input: TemplateInput & { items: NewTemplateItem[] }) =>
    request<AdminTemplate>('/admin/templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTemplate: (
    id: string,
    input: TemplateInput & {
      items: (NewTemplateItem & { position: number })[];
    },
  ) =>
    request<AdminTemplate>(`/admin/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  quickSetupTemplate: (input: QuickSetupTemplateRequest) =>
    request<QuickSetupTemplateResponse>('/admin/templates/quick-setup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  aiStandards: () => request<AiStandard[]>('/admin/ai-standards'),
  createAiStandard: (input: CreateAiStandardRequest) =>
    request<AiStandard>('/admin/ai-standards', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateAiStandard: (id: string, input: UpdateAiStandardRequest) =>
    request<AiStandard>(`/admin/ai-standards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteAiStandard: (id: string) =>
    request<void>(`/admin/ai-standards/${id}`, { method: 'DELETE' }),
  schedules: () => request<AdminSchedule[]>('/admin/schedules'),
  createSchedule: (input: ScheduleDefinition) =>
    request<AdminSchedule>('/admin/schedules', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSchedule: (id: string, input: ScheduleDefinition) =>
    request<AdminSchedule>(`/admin/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteSchedule: (id: string) =>
    request<void>(`/admin/schedules/${id}`, { method: 'DELETE' }),
  siteSchedules: () => request<AdminSiteSchedule[]>('/admin/site-schedules'),
  assignSchedule: (input: AssignScheduleRequest) =>
    request<AdminSiteSchedule[]>('/admin/site-schedules', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  addScheduleSkips: (input: AddScheduleSkipsRequest) =>
    request<AdminSiteSchedule[]>('/admin/site-schedules/skips', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteScheduleSkip: (id: string) =>
    request<void>(`/admin/site-schedules/skips/${id}`, { method: 'DELETE' }),
};
