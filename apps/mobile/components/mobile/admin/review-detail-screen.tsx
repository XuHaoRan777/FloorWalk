import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { BackHandler, View } from 'react-native';
import type { TaskItemDecisionRequest, TaskReview } from '@libs/shared';
import { reviewApi } from '../../../lib/api/review';
import { ChatPanel } from '../chat-panel';
import { ReviewScoreRing } from '../review-score-ring';
import { AdminCard, AdminPage, AdminText } from './admin-ui';
import { ReviewItem } from './review-item';
import { reviewScore, reviewTime } from './review-format';
import { useAdminAction, useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';

export function ReviewDetailScreen({
  id,
  returnTo,
}: {
  id: string;
  returnTo: 'today' | 'review' | 'notifications';
}) {
  const router = useRouter();
  const fetcher = useCallback(() => reviewApi.task(id), [id]);
  const resource = useAdminResource(fetcher, null as TaskReview | null);
  const action = useAdminAction();
  const [now, setNow] = useState(Date.now());
  const [feedbackSequence, setFeedbackSequence] = useState(0);
  const task = resource.data;
  useAdminFocus(resource.load);
  const goBack = useCallback(() => {
    router.replace(
      returnTo === 'today'
        ? '/admin/today'
        : returnTo === 'notifications'
          ? '/admin/notifications'
          : '/admin/review',
    );
  }, [returnTo, router]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          goBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [goBack]),
  );
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
    if (saved) setFeedbackSequence((sequence) => sequence + 1);
    return saved;
  }

  return (
    <AdminPage
      title="任务审核"
      backLabel="返回"
      onBack={goBack}
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
    >
      {task ? (
        <>
          <AdminCard testID="review-summary">
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <AdminText>{task.site.name}</AdminText>
                <AdminText>{`${task.site.code} · ${task.templateName} · ${task.taskDate}`}</AdminText>
                <AdminText>{`截止 ${reviewTime(task.dueAt)}`}</AdminText>
                <AdminText>{reviewScore(task)}</AdminText>
              </View>
              <ReviewScoreRing task={task} playbackKey={feedbackSequence} />
            </View>
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
