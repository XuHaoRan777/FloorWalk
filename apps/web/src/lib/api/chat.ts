import type { ChatMessage, ChatMessagesResponse } from '@libs/shared';
import { request } from './request';
import { UnauthorizedError } from './errors';

type ChatImageUrlResponse = { url: string; expiresAt: string };

async function chatRequest<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    return await request<T>(path, options);
  } catch (error) {
    // The global 401 handler unmounts the panel, so keep its message readable.
    if (error instanceof UnauthorizedError) window.alert(error.message);
    throw error;
  }
}

export const getChatMessages = (
  inspectionId: string,
  options: { after?: string; before?: string } = {},
) => {
  const query = new URLSearchParams(options).toString();
  return chatRequest<ChatMessagesResponse>(
    `/inspections/${inspectionId}/messages${query ? `?${query}` : ''}`,
  );
};

export const getChatImageUrl = (messageId: string) =>
  chatRequest<ChatImageUrlResponse>(`/messages/${messageId}/image-url`);

export const sendChatMessage = (
  inspectionId: string,
  input: { text?: string; file?: File },
) => {
  const body = new FormData();
  if (input.text) body.append('text', input.text);
  if (input.file) body.append('file', input.file);
  return chatRequest<ChatMessage>(`/inspections/${inspectionId}/messages`, {
    method: 'POST',
    body,
  });
};
