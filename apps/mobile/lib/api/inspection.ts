import type {
  InspectionDetail,
  InspectorTaskDetail,
  TaskItemUploadResponse,
  TodayResponse,
} from '@libs/shared';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { ApiError } from './errors';
import { getMessage, logRaw, request } from './request';

export const today = () => request<TodayResponse>('/inspector/today');

export const inspectorTask = (id: string) =>
  request<InspectorTaskDetail>(`/inspector/tasks/${id}`);

export const uploadInspectorTaskItem = async (
  taskId: string,
  position: number,
  input: {
    selfAssessment: 'pass' | 'fail';
    note?: string;
    photos: Array<{ uri: string; fileName: string }>;
  },
) => {
  const form = new FormData();
  form.append('selfAssessment', input.selfAssessment);
  if (input.note?.trim()) form.append('note', input.note.trim());
  try {
    for (const photo of input.photos) {
      if (Platform.OS === 'web') {
        const blob = await fetch(photo.uri).then((response) => response.blob());
        form.append('files', blob, photo.fileName);
      } else {
        form.append('files', new File(photo.uri), photo.fileName);
      }
    }
  } catch (error) {
    logRaw('读取照片失败', {
      taskId,
      position,
      fileNames: input.photos.map((photo) => photo.fileName),
      error,
    });
    throw new ApiError(
      getMessage(0, 'FILE_READ_FAILED'),
      0,
      'FILE_READ_FAILED',
    );
  }
  return request<TaskItemUploadResponse>(
    `/tasks/${taskId}/items/${position}/uploads`,
    { method: 'POST', body: form },
  );
};

export const inspection = (id: string) =>
  request<InspectionDetail>(`/inspections/${id}`);
