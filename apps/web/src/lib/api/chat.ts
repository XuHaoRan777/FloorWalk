import type { ChatMessage, ChatMessagesResponse } from '@libs/shared';
import { request } from './request';

export const getChatMessages = (inspectionId: string) =>
  request<ChatMessagesResponse>(`/inspections/${inspectionId}/messages`);

export const sendChatMessage = (
  inspectionId: string,
  input: { text?: string; file?: File },
) => {
  const body = new FormData();
  if (input.text) body.append('text', input.text);
  if (input.file) body.append('file', input.file);
  return request<ChatMessage>(`/inspections/${inspectionId}/messages`, {
    method: 'POST',
    body,
  });
};
