import type { ChatMessage, ChatMessagesResponse } from '@libs/shared';
import { request } from './request';

type ChatImageUrlResponse = { url: string; expiresAt: string };

export const getChatMessages = (
  inspectionId: string,
  options: { after?: string; before?: string } = {},
) => {
  const query = new URLSearchParams(options).toString();
  return request<ChatMessagesResponse>(
    `/inspections/${inspectionId}/messages${query ? `?${query}` : ''}`,
  );
};

export const getChatImageUrl = (messageId: string) =>
  request<ChatImageUrlResponse>(`/messages/${messageId}/image-url`);

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
