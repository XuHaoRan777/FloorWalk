import { useEffect, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, RotateCcw, X } from 'lucide-react';
import type { InspectionItemDecisionResult, TaskReview } from '@libs/shared';
import { decideTaskItem, getTaskReview } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { EvidenceImage } from './evidence-image';
import { getErrorMessage } from './helpers';
import { ChatPanel } from './chat-panel';
import { statusLabel } from './labels';
import { ReviewScoreRing } from './review-score-ring';

const resultLabel: Record<InspectionItemDecisionResult, string> = {
  pass: '通过',
  rework: '打回',
  fail: '不合格',
};

const resultTone = {
  pending: 'submitted',
  pass: 'passed',
  rework: 'rework',
  fail: 'failed',
} as const;

function uploadTime(value: string | null) {
  if (!value) return '未上传';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function ReviewDetail({
  initialTask,
  canReview,
  canSendChat,
  onBack,
  onReviewed,
}: {
  initialTask: TaskReview;
  canReview: boolean;
  canSendChat: boolean;
  onBack: () => void;
  onReviewed: () => void;
}) {
  const [task, setTask] = useState(initialTask);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [reworkItemId, setReworkItemId] = useState<string | null>(null);
  const [reworkReason, setReworkReason] = useState('');
  const [ringPlayback, setRingPlayback] = useState({ key: 0, active: false });
  const locked = task.decidedAt !== null;
  const status =
    task.inspectionStatus ?? (task.status === 'overdue' ? 'failed' : 'draft');
  useEffect(() => {
    const graceDeadline = new Date(task.dueAt).getTime() + 60 * 60 * 1000;
    const delay = graceDeadline - Date.now();
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, delay) + 1,
    );
    return () => window.clearTimeout(timer);
  }, [task.dueAt]);
  const reworkAllowed = now < new Date(task.dueAt).getTime() + 60 * 60 * 1000;

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setTask(await getTaskReview(task.id));
      setRingPlayback((current) => ({ ...current, active: false }));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    itemId: string,
    result: InspectionItemDecisionResult,
    reason?: string,
  ) {
    setBusyItemId(itemId);
    setError('');
    try {
      const decision =
        result === 'rework' ? { result, reason: reason ?? '' } : { result };
      const nextTask = await decideTaskItem(task.id, itemId, decision);
      setTask(nextTask);
      const startedDecision =
        task.decidedAt === null && nextTask.decidedAt !== null;
      const changedDecision = task.decidedAt !== null;
      if (startedDecision || changedDecision) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setRingPlayback((current) => ({ ...current, active: false }));
        } else {
          setRingPlayback((current) =>
            current.active
              ? { ...current, active: false }
              : { key: current.key + 1, active: true },
          );
        }
      } else {
        setRingPlayback((current) => ({ ...current, active: false }));
      }
      onReviewed();
      if (result === 'rework') {
        setReworkItemId(null);
        setReworkReason('');
      }
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusyItemId(null);
    }
  }

  function finishRingPlayback() {
    setRingPlayback((current) => ({ ...current, active: false }));
  }

  return (
    <>
      <div className="fw-page-heading min-w-0 items-start">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-3 mb-3"
          >
            <ArrowLeft aria-hidden="true" />
            返回队列
          </Button>
          <p className="fw-page-eyebrow">
            {task.site.code} · {task.taskDate}
          </p>
          <h1 className="break-all">{task.site.name}</h1>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {task.templateName} · 截止 {uploadTime(task.dueAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:gap-3">
          <span
            className="fw-dashboard-status whitespace-nowrap"
            data-status={status}
          >
            {task.inspectionStatus
              ? statusLabel[task.inspectionStatus]
              : locked
                ? '已判定'
                : '待判定'}
          </span>
          <ReviewScoreRing
            key={ringPlayback.key}
            task={task}
            playing={ringPlayback.active}
            onPlaybackEnd={finishRingPlayback}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="刷新任务"
            title="刷新任务"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      </div>
      <ErrorBanner message={error} />
      {busy && (
        <div
          className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          正在更新任务…
        </div>
      )}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)] xl:items-start">
        <section className="min-w-0 space-y-3" aria-labelledby="items-heading">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 id="items-heading" className="fw-section-title">
              检查项
            </h2>
            <span className="text-sm text-muted-foreground">
              {task.items.filter((item) => item.uploadedAt).length}/
              {task.items.length} 项已上传
              {task.decidedAt ? ` · 判定于 ${uploadTime(task.decidedAt)}` : ''}
            </span>
          </div>
          {task.items.length === 0 ? (
            <div className="fw-state">
              <p>此任务没有可判定的检查项。</p>
            </div>
          ) : (
            <div className="min-w-0 divide-y divide-rule border-y border-rule">
              {task.items.map((item) => {
                const itemBusy = busyItemId === item.id;
                const canDecide =
                  canReview && (locked || item.uploadedAt !== null) && !busy;
                return (
                  <article key={item.id} className="min-w-0 py-4 first:pt-0">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-all font-medium">
                          {item.position}. {item.title}
                          {item.critical ? ' · 严重项' : ''}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.minPhotoCount > 0
                            ? `至少 ${item.minPhotoCount} 张照片`
                            : '可不上传照片，需填写备注'}
                          {item.incomplete ? ' · 未完成' : ''}
                        </p>
                        <p className="mt-2 break-all text-sm text-muted-foreground">
                          {item.uploadedByName ?? '系统'} · 上传于{' '}
                          {uploadTime(item.uploadedAt)}
                          {item.selfAssessment
                            ? ` · 自评${item.selfAssessment === 'pass' ? '通过' : '不通过'}`
                            : ''}
                        </p>
                      </div>
                      <span
                        className="fw-dashboard-status whitespace-nowrap"
                        data-status={resultTone[item.result]}
                      >
                        {item.result === 'pending'
                          ? '待判定'
                          : resultLabel[item.result]}
                      </span>
                    </div>
                    {item.acceptanceCriteria && (
                      <p className="mt-3 break-all text-sm text-muted-foreground">
                        验收要点：{item.acceptanceCriteria}
                      </p>
                    )}
                    {item.aiReason && (
                      <p className="mt-3 break-all border-l-2 border-accent bg-raised px-3 py-2 text-sm">
                        AI 理由：{item.aiReason}
                      </p>
                    )}
                    {item.lastReworkReason && (
                      <p className="mt-3 break-all border-l-2 border-warning bg-raised px-3 py-2 text-sm">
                        打回理由：{item.lastReworkReason}
                      </p>
                    )}
                    {item.note && (
                      <p className="mt-3 break-all border-l-2 border-accent bg-raised px-3 py-2 text-sm">
                        备注：{item.note}
                      </p>
                    )}
                    {item.evidence.length > 0 && (
                      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
                        {item.evidence.map((evidence) => (
                          <EvidenceImage
                            key={evidence.id}
                            evidence={evidence}
                          />
                        ))}
                      </div>
                    )}
                    {canReview && (
                      <div
                        className="mt-4 flex flex-wrap gap-2"
                        aria-label={`${item.title}判定`}
                      >
                        <Button
                          size="sm"
                          onClick={() => void decide(item.id, 'pass')}
                          disabled={
                            !canDecide || itemBusy || item.result === 'pass'
                          }
                        >
                          <Check aria-hidden="true" />
                          通过
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReworkItemId(item.id);
                            setReworkReason(item.lastReworkReason ?? '');
                          }}
                          disabled={
                            !canDecide ||
                            !reworkAllowed ||
                            itemBusy ||
                            item.result === 'rework'
                          }
                        >
                          <RotateCcw aria-hidden="true" />
                          打回
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void decide(item.id, 'fail')}
                          disabled={
                            !canDecide || itemBusy || item.result === 'fail'
                          }
                        >
                          <X aria-hidden="true" />
                          不合格
                        </Button>
                      </div>
                    )}
                    {canReview && reworkItemId === item.id && (
                      <div className="mt-3 space-y-2">
                        <label className="grid gap-1.5 text-sm font-medium">
                          打回理由
                          <textarea
                            rows={3}
                            className="w-full min-w-0 rounded-md border bg-background px-3 py-2 font-normal"
                            value={reworkReason}
                            onChange={(event) =>
                              setReworkReason(event.target.value)
                            }
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              void decide(item.id, 'rework', reworkReason)
                            }
                            disabled={
                              !reworkReason.trim() ||
                              !canDecide ||
                              !reworkAllowed ||
                              itemBusy
                            }
                          >
                            确认打回
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReworkItemId(null);
                              setReworkReason('');
                            }}
                            disabled={itemBusy}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    )}
                    {itemBusy && (
                      <span className="sr-only" role="status">
                        正在保存判定
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
        {task.inspectionId && (
          <aside className="min-w-0 xl:sticky xl:top-4">
            <ChatPanel inspectionId={task.inspectionId} canSend={canSendChat} />
          </aside>
        )}
      </div>
    </>
  );
}
