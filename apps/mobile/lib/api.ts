import {
  login,
  logout,
  me,
  changePassword,
  requestPasswordRecoveryCode,
  verifyPasswordRecoveryCode,
  resetPasswordRecovery,
} from './api/auth';
import {
  inspection,
  inspectorTask,
  today,
  uploadInspectorTaskItem,
} from './api/inspection';
import { chatMessages, sendChatMessage } from './api/chat';
import { inspectorRecords } from './api/records';
export { ApiError } from './api/errors';
export { userFacingError } from './api/request';

export const api = {
  login,
  logout,
  me,
  changePassword,
  requestPasswordRecoveryCode,
  verifyPasswordRecoveryCode,
  resetPasswordRecovery,
  today,
  inspectorTask,
  uploadInspectorTaskItem,
  inspection,
  chatMessages,
  sendChatMessage,
  inspectorRecords,
};
