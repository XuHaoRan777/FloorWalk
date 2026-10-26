import { login, me } from './api/auth';
import { uploadEvidence } from './api/evidence';
import {
  inspection,
  today,
  createInspection,
  updateItem,
  submit,
} from './api/inspection';
export { ApiError } from './api/errors';
export { userFacingError } from './api/request';

export const api = {
  login,
  me,
  today,
  createInspection,
  inspection,
  updateItem,
  uploadEvidence,
  submit,
};
