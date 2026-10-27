import type {
  InspectionDetail,
  TodayResponse,
  UpdateInspectionItemResponse,
} from '@libs/shared';
import { request } from './request';

export const today = () => request<TodayResponse>('/inspector/today');

export const createInspection = (templateId: string) =>
  request<{ id: string }>('/inspections', {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  });

export const inspection = (id: string) =>
  request<InspectionDetail>(`/inspections/${id}`);

export const updateItem = (
  inspectionId: string,
  itemId: string,
  result: 'pending' | 'pass' | 'fail',
  note: string | null,
) =>
  request<UpdateInspectionItemResponse>(
    `/inspections/${inspectionId}/items/${itemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ result, note }),
    },
  );

export const submit = (id: string) =>
  request<{ status: string; score: number | null }>(
    `/inspections/${id}/submit`,
    {
      method: 'POST',
    },
  );
