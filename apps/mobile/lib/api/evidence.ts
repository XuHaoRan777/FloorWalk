import type { Evidence } from '@libs/shared';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { ApiError } from './errors';
import { getMessage, logRaw, request } from './request';

export const uploadEvidence = async (
  inspectionId: string,
  itemId: string,
  uri: string,
  fileName: string,
) => {
  const form = new FormData();
  try {
    if (Platform.OS === 'web') {
      const blob = await fetch(uri).then((response) => response.blob());
      form.append('file', blob, fileName);
    } else {
      const file = new File(uri);
      form.append('file', file, fileName);
    }
  } catch (error) {
    logRaw('读取照片失败', { uri, fileName, error });
    throw new ApiError(
      getMessage(0, 'FILE_READ_FAILED'),
      0,
      'FILE_READ_FAILED',
    );
  }
  return request<Evidence>(
    `/inspections/${inspectionId}/items/${itemId}/evidence`,
    {
      method: 'POST',
      body: form,
    },
  );
};
