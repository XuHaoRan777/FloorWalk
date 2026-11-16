export function percentage(value: number | null) {
  return value === null
    ? '—'
    : new Intl.NumberFormat('zh-CN', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value);
}

export function scoreLabel(value: number | null) {
  return value === null
    ? '—'
    : `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)} 分`;
}
