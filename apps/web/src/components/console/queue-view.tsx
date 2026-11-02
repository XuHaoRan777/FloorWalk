import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, LoaderCircle, RotateCcw } from 'lucide-react';
import { getReviewQueue, type InspectionDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { formatTime, getErrorMessage } from './helpers';
import { StatusPill } from './status-pill';

export function QueueView({
  canReview,
  onSelect,
}: {
  canReview: boolean;
  onSelect: (inspection: InspectionDetail) => void;
}) {
  const [queue, setQueue] = useState<InspectionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getReviewQueue()
      .then(setQueue)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  return (
    <>
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">现场提交的巡检单</p>
          <h1>审核队列</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RotateCcw aria-hidden="true" />
          刷新队列
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="fw-state" role="status">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          正在加载审核队列…
        </p>
      ) : error && queue.length === 0 ? null : queue.length === 0 ? (
        <div className="fw-state">
          <ClipboardCheck aria-hidden="true" />
          <p>当前没有待审核巡检单。</p>
        </div>
      ) : (
        <div className="divide-y divide-rule border-y border-rule">
          {queue.map((inspection) => (
            <button
              type="button"
              key={inspection.id}
              onClick={() => onSelect(inspection)}
              className="fw-list-row grid w-full gap-3 py-4 text-left transition-colors hover:bg-raised sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            >
              <span>
                <span className="block font-medium">
                  {inspection.site.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  <span className="font-mono">{inspection.site.code}</span>
                  {' · 提交于 '}
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
              <span className="text-sm text-accent">
                {canReview ? '查看并审核 →' : '查看详情 →'}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
