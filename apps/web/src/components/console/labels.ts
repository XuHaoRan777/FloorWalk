export const roleLabel = {
  inspector: '店员',
  supervisor: '主管',
  hq: '总部',
} as const;

export const statusLabel = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  passed: '已通过',
  rework: '已打回',
  failed: '不合格',
} as const;

export const actionLabel = {
  start: '开始审核',
  approve: '通过',
  rework: '打回',
  fail: '判不合格',
} as const;
