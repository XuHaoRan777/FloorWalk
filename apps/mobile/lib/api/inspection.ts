import type {
  InspectionDetail,
  TodayResponse,
  UpdateInspectionItemResponse,
} from '@libs/shared';
import { request } from './request';

export const today = (token: string) =>
  request<TodayResponse>('/inspector/today', token);

export const createInspection = (token: string, templateId: string) =>
  request<{ id: string }>('/inspections', token, {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  });

export const inspection = (token: string, id: string) =>
  request<InspectionDetail>(`/inspections/${id}`, token);

export const updateItem = (
  token: string,
  inspectionId: string,
  itemId: string,
  result: 'pending' | 'pass' | 'fail',
  note: string | null,
) =>
  request<UpdateInspectionItemResponse>(
    `/inspections/${inspectionId}/items/${itemId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ result, note }),
    },
  );

export const submit = (token: string, id: string) =>
  request<{ status: string; score: number | null }>(
    `/inspections/${id}/submit`,
    token,
    {
      method: 'POST',
    },
  );
