import { useEffect, useState } from 'react';
import { ArrowLeft, Check, RotateCcw, X } from 'lucide-react';
import {
  reviewInspection,
  type InspectionDetail,
  type Review,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { EvidenceImage } from './evidence-image';
import { formatTime, getErrorMessage } from './helpers';
import { actionLabel } from './labels';
import { StatusPill } from './status-pill';

export function ReviewDetail({
  token,
  initialInspection,
  canReview,
  onBack,
}: {
  token: string;
  initialInspection: InspectionDetail;
  canReview: boolean;
  onBack: () => void;
}) {
  const [inspection, setInspection] = useState(initialInspection);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reworkPrompt, setReworkPrompt] = useState(false);
  const startedAtOpen = canReview && initialInspection.status === 'submitted';
  const criticalFailure = inspection.items.some(
    (item) => item.critical && item.result === 'fail',
  );
  useEffect(() => {
    if (!canReview || inspection.status !== 'submitted') return;
    setBusy(true);
    void reviewInspection(token, inspection.id, { action: 'start' })
      .then(setInspection)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setBusy(false));
  }, [canReview, inspection.id, inspection.status, token]);
  const submitReview = (action: Review['action']) => {
    if (action === 'rework' && selectedItems.length === 0) {
      setReworkPrompt(true);
      setError('打回时至少选择一个检查项。');
      return;
    }
    setBusy(true);
    setError('');
    void reviewInspection(token, inspection.id, {
      action,
      comment: comment.trim() || null,
      ...(action === 'rework' ? { reworkItemIds: selectedItems } : {}),
    })
      .then(setInspection)
      .then(() => setReworkPrompt(false))
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setBusy(false));
  };
  const toggleItem = (id: string) =>
    setSelectedItems((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-3 mb-3"
          >
            <ArrowLeft aria-hidden="true" />
            返回队列
          </Button>
          <p className="text-sm text-muted-foreground">
            {inspection.site.code}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {inspection.site.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={inspection.status} />
          <span className="text-2xl font-semibold">
            {inspection.score === null ? '—' : `${inspection.score} 分`}
          </span>
        </div>
      </div>
      <ErrorBanner message={error} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-3" aria-labelledby="items-heading">
          <div className="flex items-center justify-between">
            <h2 id="items-heading" className="text-lg font-semibold">
              检查项
            </h2>
            <span className="text-sm text-muted-foreground">
              提交于 {formatTime(inspection.submittedAt)}
            </span>
          </div>
          {inspection.items.map((item) => (
            <article key={item.id} className="rounded-md border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.critical ? '严重项 · ' : ''}
                    {item.photoRequired ? '需要照片' : '无需照片'}
                  </p>
                </div>
                <span className="text-sm font-medium">
                  {item.result === 'pass'
                    ? '通过'
                    : item.result === 'fail'
                      ? '不通过'
                      : '未填写'}
                </span>
              </div>
              {item.note && (
                <p className="mt-3 rounded bg-muted p-3 text-sm">
                  备注：{item.note}
                </p>
              )}
              {canReview && reworkPrompt && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => toggleItem(item.id)}
                  />
                  选择为打回项
                </label>
              )}
              {item.evidence.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {item.evidence.map((evidence) => (
                    <EvidenceImage
                      key={evidence.id}
                      token={token}
                      evidence={evidence}
                    />
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
        <aside className="space-y-4">
          {canReview && (
            <section className="rounded-md border bg-card p-4">
              <h2 className="font-semibold">审核决定</h2>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="填写审核意见（可选）"
                className="mt-3 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {criticalFailure && (
                <p className="mt-3 text-sm text-destructive">
                  存在严重项不合格，不能通过。
                </p>
              )}
              <div className="mt-4 grid gap-2">
                <Button
                  onClick={() => submitReview('approve')}
                  disabled={busy || criticalFailure}
                >
                  <Check aria-hidden="true" />
                  通过
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setReworkPrompt(true);
                    setError('打回时至少选择一个检查项。');
                  }}
                  disabled={busy}
                >
                  <RotateCcw aria-hidden="true" />
                  打回
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => submitReview('fail')}
                  disabled={busy}
                >
                  <X aria-hidden="true" />
                  判不合格
                </Button>
                {reworkPrompt && (
                  <Button
                    variant="secondary"
                    onClick={() => submitReview('rework')}
                    disabled={busy}
                  >
                    确认打回
                  </Button>
                )}
              </div>
            </section>
          )}
          <section className="rounded-md border bg-card p-4">
            <h2 className="font-semibold">审核历史</h2>
            <ol className="mt-3 space-y-3">
              {inspection.reviews.length === 0 ? (
                <li className="text-sm text-muted-foreground">
                  {startedAtOpen ? '开始审核（已自动提交）' : '暂无审核记录'}
                </li>
              ) : (
                inspection.reviews.map((review) => (
                  <li key={review.id} className="border-l-2 pl-3 text-sm">
                    <p className="font-medium">{actionLabel[review.action]}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(review.createdAt)}
                    </p>
                    {review.comment && (
                      <p className="mt-1 text-muted-foreground">
                        {review.comment}
                      </p>
                    )}
                  </li>
                ))
              )}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
