import type { AdminSitesResponse, Template } from '@libs/shared';
import { request } from './request';

export const getAdminSites = () => request<AdminSitesResponse>('/admin/sites');
export const getAdminTemplates = () => request<Template[]>('/admin/templates');
