import type {
  AdminSitesResponse,
  AdminTemplatesResponse,
  Site,
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
export type NewTemplateItem = {
  title: string;
  photoRequired: boolean;
  critical: boolean;
};
export type UpdatedTemplateItem = NewTemplateItem & { position: number };

export const getAdminTemplates = () =>
  request<AdminTemplatesResponse>('/admin/templates');
export const createAdminTemplate = (input: {
  name: string;
  items: NewTemplateItem[];
}) =>
  request<AdminTemplate>('/admin/templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateAdminTemplate = (
  id: string,
  input: { name: string; items: UpdatedTemplateItem[] },
) =>
  request<AdminTemplate>(`/admin/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
export const setCurrentAdminTemplate = (id: string) =>
  request<AdminTemplate>(`/admin/templates/${id}/current`, {
    method: 'POST',
  });
