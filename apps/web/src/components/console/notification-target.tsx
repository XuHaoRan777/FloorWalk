import { useEffect, useState } from 'react';
import type { Notification, TaskReview } from '@libs/shared';
import type { InspectionDetail } from '@/lib/api';
import { getInspection, getTaskReview } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChatPanel } from './chat-panel';
import { EvidenceImage } from './evidence-image';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';
import { ReviewDetail } from './review-detail';

export function NotificationTarget({
  notification,
  canReview,
  onBack,
  onReviewed,
}: {
  notification: Notification;
  canReview: boolean;
  onBack: () => void;
  onReviewed: () => void;
}) {
  const [review, setReview] = useState<TaskReview | null>(null);
  const [inspection, setInspection] = useState<InspectionDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setReview(null);
    setInspection(null);
    const load = async () => {
      try {
        if (canReview && notification.type !== 'chat_message') {
          const result = await getTaskReview(notification.payload.taskId);
          if (active) setReview(result);
        } else if ('inspectionId' in notification.payload) {
          const result = await getInspection(notification.payload.inspectionId);
          if (active) setInspection(result);
        } else {
          throw new Error('此通知没有可访问的巡检详情。');
        }
      } catch (reason) {
        if (active) setError(getErrorMessage(reason));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [canReview, notification]);

  if (review)
    return (
      <ReviewDetail
        initialTask={review}
        canReview={canReview}
        canSendChat={false}
        onBack={onBack}
        onReviewed={onReviewed}
      />
    );

  if (loading)
    return (
      <p role="status" className="py-8 text-sm text-muted-foreground">
        正在加载巡检…
      </p>
    );

  if (!inspection)
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          返回通知
        </Button>
        <ErrorBanner message={error || '巡检详情暂不可用。'} />
      </div>
    );

  const chat = notification.type === 'chat_message';
  const notificationContext =
    notification.type === 'item_rework'
      ? `打回理由：${notification.payload.reason}`
      : notification.type === 'inspection_decided'
        ? `整单${notification.payload.status === 'passed' ? '通过' : '不合格'}，${notification.payload.score} 分`
        : 'position' in notification.payload
          ? `第 ${notification.payload.position} 项`
          : null;
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          返回通知
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">
          {inspection.site.code} · {inspection.site.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">巡检详情</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {inspection.status === 'passed'
            ? '通过'
            : inspection.status === 'failed'
              ? '不合格'
              : '进行中'}
          {inspection.score === null ? '' : ` · ${inspection.score} 分`}
        </p>
        {notificationContext && (
          <p className="mt-2 border-l-2 border-primary pl-3 text-sm">
            {notificationContext}
          </p>
        )}
      </div>
      {!chat && (
        <section className="space-y-3" aria-label="检查项">
          {inspection.items.map((item) => (
            <article key={item.id} className="fw-list-row space-y-2 py-4">
              <h2 className="font-medium">
                {item.position}. {item.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {item.result === 'rework'
                  ? '打回'
                  : item.result === 'fail'
                    ? '不合格'
                    : item.result === 'pass'
                      ? '通过'
                      : '待判定'}
                {item.critical ? ' · 严重项' : ''}
              </p>
              {item.note && <p className="text-sm">{item.note}</p>}
              {item.evidence.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {item.evidence.map((evidence) => (
                    <EvidenceImage key={evidence.id} evidence={evidence} />
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {chat && <ChatPanel inspectionId={inspection.id} canSend={false} />}
    </div>
  );
}
