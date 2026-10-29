import type { ChatMessage, ChatMessagesResponse } from '@libs/shared';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { request } from './request';

export const chatMessages = (
  inspectionId: string,
  options: { after?: string; before?: string } = {},
) => {
  const query = new URLSearchParams(options).toString();
  return request<ChatMessagesResponse>(
    `/inspections/${inspectionId}/messages${query ? `?${query}` : ''}`,
  );
};

export const chatImageUrl = (messageId: string) =>
  request<{ url: string; expiresAt: string }>(
    `/messages/${messageId}/image-url`,
  );

export const sendChatMessage = async (
  inspectionId: string,
  input: { text?: string; imageUri?: string; fileName?: string },
) => {
  const form = new FormData();
  if (input.text) form.append('text', input.text);
  if (input.imageUri) {
    if (Platform.OS === 'web') {
      const blob = await fetch(input.imageUri).then((response) =>
        response.blob(),
      );
      form.append('file', blob, input.fileName ?? 'chat-image.jpg');
    } else {
      form.append(
        'file',
        new File(input.imageUri),
        input.fileName ?? 'chat-image.jpg',
      );
    }
  }
  return request<ChatMessage>(`/inspections/${inspectionId}/messages`, {
    method: 'POST',
    body: form,
  });
};
