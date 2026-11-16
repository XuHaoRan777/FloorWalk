import type { TaskReview } from '@libs/shared';

export function reviewTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(value))
    : '未上传';
}

export function reviewScore(task: TaskReview) {
  const status =
    task.inspectionStatus === 'passed'
      ? '通过'
      : task.inspectionStatus === 'failed'
        ? '不合格'
        : task.decidedAt
          ? '已判定'
          : '待判定';
  return `${status} · ${task.score === null ? '—' : task.score} 分`;
}
