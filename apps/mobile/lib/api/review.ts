import type { TaskItemDecisionRequest, TaskReview } from '@libs/shared';
import { request } from './request';

export const reviewApi = {
  queue: () => request<TaskReview[]>('/review/tasks'),
  task: (id: string) => request<TaskReview>(`/tasks/${id}/review`),
  decide: (taskId: string, itemId: string, body: TaskItemDecisionRequest) =>
    request<TaskReview>(`/tasks/${taskId}/items/${itemId}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
