import { ApiError } from '@/lib/api';

export function formatTime(value: string | null) {
  if (!value) return '未提交';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function getErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : '页面加载失败，请稍后重试。';
}
