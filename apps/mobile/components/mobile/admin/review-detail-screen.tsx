import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import type { TaskItemDecisionRequest, TaskReview } from '@libs/shared';
import { reviewApi } from '../../../lib/api/review';
import { PrimaryButton } from '../primary-button';
import { ChatPanel } from '../chat-panel';
import { AdminCard, AdminPage, AdminText } from './admin-ui';
import { ReviewItem } from './review-item';
import { reviewScore, reviewTime } from './review-format';
import { useAdminAction, useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';

export function ReviewDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const fetcher = useCallback(() => reviewApi.task(id), [id]);
  const resource = useAdminResource(fetcher, null as TaskReview | null);
  const action = useAdminAction();
  const [now, setNow] = useState(Date.now());
  const task = resource.data;
  useAdminFocus(resource.load);
  const deadline = task ? new Date(task.dueAt).getTime() + 60 * 60_000 : 0;
  useEffect(() => {
    if (!deadline) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, deadline - Date.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [deadline]);

  async function decide(itemId: string, decision: TaskItemDecisionRequest) {
    let saved = false;
    await action.run(async () => {
      resource.setData(await reviewApi.decide(id, itemId, decision));
      setNow(Date.now());
      saved = true;
    }, '判定已保存');
    return saved;
  }

  return (
    <AdminPage
      title="任务审核"
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
    >
      <PrimaryButton
        variant="secondary"
        disabled={action.busy}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/admin/review')
        }
      >
        返回队列
      </PrimaryButton>
      {task ? (
        <>
          <AdminCard testID="review-summary">
            <AdminText>{task.site.name}</AdminText>
            <AdminText>{`${task.site.code} · ${task.templateName} · ${task.taskDate}`}</AdminText>
            <AdminText>{`截止 ${reviewTime(task.dueAt)}`}</AdminText>
            <AdminText>{reviewScore(task)}</AdminText>
            {task.decidedAt ? (
              <AdminText>{`判定于 ${reviewTime(task.decidedAt)}，可逐条改判`}</AdminText>
            ) : null}
          </AdminCard>
          {task.items.length === 0 ? (
            <AdminText>此任务没有可判定的检查项。</AdminText>
          ) : null}
          {task.items.map((item) => (
            <ReviewItem
              key={item.id}
              item={item}
              locked={task.decidedAt !== null}
              reworkAllowed={now < deadline}
              busy={action.busy || resource.loading}
              decide={decide}
            />
          ))}
          {task.inspectionId ? (
            <ChatPanel inspectionId={task.inspectionId} canSend={false} />
          ) : null}
        </>
      ) : null}
    </AdminPage>
  );
}
