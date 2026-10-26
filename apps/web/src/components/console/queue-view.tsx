import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getReviewQueue, type InspectionDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { formatTime, getErrorMessage } from './helpers';
import { StatusPill } from './status-pill';

export function QueueView({
  token,
  canReview,
  onSelect,
}: {
  token: string;
  canReview: boolean;
  onSelect: (inspection: InspectionDetail) => void;
}) {
  const [queue, setQueue] = useState<InspectionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getReviewQueue(token)
      .then(setQueue)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => load(), [load]);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">现场提交的巡检单</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            审核队列
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RotateCcw aria-hidden="true" />
          刷新队列
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          正在加载审核队列…
        </p>
      ) : queue.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          当前没有待审核巡检单。
        </p>
      ) : (
        <div className="grid gap-3">
          {queue.map((inspection) => (
            <button
              type="button"
              key={inspection.id}
              onClick={() => onSelect(inspection)}
              className="grid gap-3 rounded-md border bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <span>
                <span className="block font-medium">
                  {inspection.site.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {inspection.site.code} · 提交于{' '}
                  {formatTime(inspection.submittedAt)}
                </span>
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span>
                  {inspection.score === null ? (
                    '未评分'
                  ) : (
                    <>
                      <span>{inspection.score}</span> 分
                    </>
                  )}
                </span>
                <StatusPill status={inspection.status} />
              </span>
              <span className="text-sm text-muted-foreground">
                {canReview ? '查看并审核 →' : '查看详情 →'}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
