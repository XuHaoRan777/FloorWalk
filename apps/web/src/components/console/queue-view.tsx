import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  ClipboardCheck,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react';
import { getTaskReviewQueue } from '@/lib/api';
import type { TaskReview } from '@libs/shared';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { formatTime, getErrorMessage } from './helpers';
import { StatusPill } from './status-pill';

export function QueueView({
  canReview,
  onSelect,
}: {
  canReview: boolean;
  onSelect: (task: TaskReview) => void;
}) {
  const [queue, setQueue] = useState<TaskReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getTaskReviewQueue()
      .then(setQueue)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  return (
    <>
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">按日程生成的检查任务</p>
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
          <p>当前没有待判定任务。</p>
        </div>
      ) : (
        <div className="divide-y divide-rule border-y border-rule">
          {queue.map((task) => (
            <button
              type="button"
              key={task.id}
              onClick={() => onSelect(task)}
              className="fw-list-row grid w-full gap-3 py-4 text-left transition-colors hover:bg-raised sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            >
              <span>
                <span className="block font-medium">{task.site.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  <span className="font-mono">{task.site.code}</span>
                  {' · '}
                  {task.taskDate}
                  {' · 截止 '}
                  {formatTime(task.dueAt)}
                </span>
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span>
                  {task.score === null ? (
                    task.items.some((item) => item.uploadedAt) ? (
                      '待判定'
                    ) : (
                      '未上传'
                    )
                  ) : (
                    <>
                      <span>{task.score}</span> 分
                    </>
                  )}
                </span>
                <StatusPill
                  status={
                    task.inspectionStatus ??
                    (task.status === 'overdue' ? 'failed' : 'draft')
                  }
                />
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-accent">
                {canReview ? '查看任务' : '查看详情'}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
