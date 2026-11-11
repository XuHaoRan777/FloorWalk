import type { TaskItemDecisionRequest, TaskReview } from '@libs/shared';
import { request } from './request';

export function getTaskReviewQueue() {
  return request<TaskReview[]>('/review/tasks');
}

export function getTaskReview(taskId: string) {
  return request<TaskReview>(`/tasks/${taskId}/review`);
}

export function decideTaskItem(
  taskId: string,
  itemId: string,
  body: TaskItemDecisionRequest,
) {
  return request<TaskReview>(`/tasks/${taskId}/items/${itemId}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
