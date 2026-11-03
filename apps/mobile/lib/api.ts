import { login, logout, me, changePassword } from './api/auth';
import { uploadEvidence } from './api/evidence';
import {
  inspection,
  today,
  createInspection,
  updateItem,
  submit,
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
  today,
  createInspection,
  inspection,
  updateItem,
  uploadEvidence,
  submit,
  chatMessages,
  sendChatMessage,
  inspectorRecords,
};
