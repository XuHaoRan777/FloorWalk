import {
  ArrowRight,
  ClipboardCheck,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react';
import type { TaskReview } from '@libs/shared';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { EmptyIllustration } from './empty-illustration';
import { formatTime } from './helpers';
import { statusLabel } from './labels';

export function QueueView({
  canReview,
  onSelect,
  manualQueue,
  decidedToday,
  loading,
  error,
  onRefresh,
}: {
  canReview: boolean;
  onSelect: (task: TaskReview) => void;
  manualQueue: TaskReview[];
  decidedToday: TaskReview[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const empty = manualQueue.length === 0 && decidedToday.length === 0;

  function renderTasks(tasks: TaskReview[], manual: boolean) {
    if (tasks.length === 0)
      return (
        <p className="fw-state">
          {manual ? '当前没有待人工任务。' : '今天还没有已判定任务。'}
        </p>
      );

    return (
      <div className="divide-y divide-rule border-y border-rule">
        {tasks.map((task) => {
          const manualItems = task.items.filter(
            (item) =>
              item.result === 'pending' && item.aiReviewStatus === 'manual',
          );
          const submissionTime =
            task.submittedAt ?? manualItems[0]?.uploadedAt ?? task.createdAt;
          const reasons = manualItems
            .map(
              (item) =>
                `${item.title}：${item.aiReason ?? '等待管理员人工判定。'}`,
            )
            .join('；');

          const status =
            task.inspectionStatus ??
            (task.status === 'overdue' ? 'failed' : 'draft');

          return (
            <button
              type="button"
              key={task.id}
              onClick={() => onSelect(task)}
              className="fw-list-row grid min-w-0 w-full gap-3 py-4 text-left transition-colors hover:bg-raised xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center"
            >
              <span className="min-w-0">
                <span className="block break-all font-medium">
                  {task.site.name}
                </span>
                <span className="mt-1 block break-all text-xs text-muted-foreground">
                  <span className="font-mono">{task.site.code}</span>
                  {' · '}
                  {task.templateName}
                  {' · '}
                  {task.taskDate}
                  {manual
                    ? ` · 提交于 ${formatTime(submissionTime)}`
                    : ` · 判定于 ${formatTime(task.decidedAt)}`}
                </span>
                {manual && (
                  <span className="mt-2 block break-all text-sm text-muted-foreground">
                    理由：{reasons}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="whitespace-nowrap">
                  {task.score === null ? '待判定' : `${task.score} 分`}
                </span>
                <span
                  className="fw-dashboard-status whitespace-nowrap"
                  data-status={status}
                >
                  {statusLabel[status]}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-accent xl:justify-self-end">
                {canReview ? '查看任务' : '查看详情'}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fw-dashboard min-w-0">
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">待人工任务与今日判定</p>
          <h1>审核队列</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
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
      ) : error && empty ? null : empty ? (
        <div className="fw-state fw-state--illustrated">
          <EmptyIllustration name="notification" />
          <ClipboardCheck aria-hidden="true" />
          <p>当前没有待人工或今日已判定任务。</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section
            className="min-w-0 space-y-3"
            aria-labelledby="manual-queue-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="manual-queue-heading" className="fw-section-title">
                待人工
              </h2>
              <span className="text-sm text-muted-foreground">
                {manualQueue.length} 个任务
              </span>
            </div>
            {renderTasks(manualQueue, true)}
          </section>
          <section
            className="min-w-0 space-y-3"
            aria-labelledby="decided-queue-heading"
          >
            <h2 id="decided-queue-heading" className="fw-section-title">
              今天已判定
            </h2>
            {renderTasks(decidedToday, false)}
          </section>
        </div>
      )}
    </div>
  );
}
