import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { BackHandler, Platform, View } from 'react-native';
import type { TaskItemDecisionRequest, TaskReview } from '@libs/shared';
import { reviewApi } from '../../../lib/api/review';
import { ChatPanel } from '../chat-panel';
import { MobileStatusTag, MobileText } from '../manager-ui';
import { MobileSurfaceCard } from '../manager-data-ui';
import { AdminField, AdminPage, AdminText } from './admin-ui';
import { ReviewItem } from './review-item';
import { reviewScore, reviewTime } from './review-format';
import { useAdminAction, useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';
import { PrimaryButton } from '../primary-button';
import tokens from '../../../../../packages/tokens/native.json';

const decisionStyles = {
  button: {
    flex: 1,
    minHeight: 48,
    marginTop: 0,
    paddingHorizontal: tokens.mobileSpace.xs,
    borderRadius: tokens.mobileRadius.primary,
  },
};

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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [reworkDraft, setReworkDraft] = useState<{
    itemId: string;
    reason: string;
  } | null>(null);
  const [pendingResult, setPendingResult] = useState<
    TaskItemDecisionRequest['result'] | null
  >(null);
  const task = resource.data;
  const selectedItem = reworkDraft
    ? task?.items.find((item) => item.id === reworkDraft.itemId)
    : (task?.items.find((item) => item.id === selectedItemId) ??
      task?.items.find((item) => item.result === 'pending') ??
      task?.items[0]);
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
      if (Platform.OS !== 'android') return;

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
      setPendingResult(decision.result);
      try {
        resource.setData(await reviewApi.decide(id, itemId, decision));
        setNow(Date.now());
        saved = true;
      } finally {
        setPendingResult(null);
      }
    }, '判定已保存');
    return saved;
  }

  const title = task?.templateName ?? '任务审核';

  return (
    <AdminPage
      title={title}
      visual="route"
      backLabel="返回"
      onBack={goBack}
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
      fixedFooter={
        task && selectedItem ? (
          <View testID="review-decision-dock">
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <MobileText
                role="fixed"
                size="xs"
                tone="muted"
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {`当前检查项 · ${selectedItem.title}`}
              </MobileText>
              <MobileStatusTag
                status={
                  selectedItem.result === 'pass'
                    ? 'completed'
                    : selectedItem.result === 'fail'
                      ? 'failed'
                      : selectedItem.result === 'rework'
                        ? 'rework'
                        : 'pending'
                }
                label={
                  selectedItem.result === 'pass'
                    ? '通过'
                    : selectedItem.result === 'fail'
                      ? '不合格'
                      : selectedItem.result === 'rework'
                        ? '打回'
                        : '待判定'
                }
              />
            </View>
            {reworkDraft === null ? (
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <PrimaryButton
                  disabled={
                    action.busy ||
                    resource.loading ||
                    (!task.decidedAt && selectedItem.uploadedAt === null) ||
                    selectedItem.result === 'pass'
                  }
                  onPress={() =>
                    void decide(selectedItem.id, { result: 'pass' })
                  }
                  testID="review-decision-pass"
                  loading={action.busy && pendingResult === 'pass'}
                  pressFeedback="surface"
                  style={decisionStyles.button}
                >
                  {action.busy && pendingResult === 'pass' ? '保存中…' : '通过'}
                </PrimaryButton>
                <PrimaryButton
                  disabled={
                    action.busy ||
                    resource.loading ||
                    (!task.decidedAt && selectedItem.uploadedAt === null) ||
                    now >= deadline ||
                    selectedItem.result === 'rework'
                  }
                  onPress={() =>
                    setReworkDraft({
                      itemId: selectedItem.id,
                      reason: selectedItem.lastReworkReason ?? '',
                    })
                  }
                  variant="secondary"
                  testID="review-decision-rework"
                  pressFeedback="surface"
                  style={decisionStyles.button}
                >
                  打回
                </PrimaryButton>
                <PrimaryButton
                  disabled={
                    action.busy ||
                    resource.loading ||
                    (!task.decidedAt && selectedItem.uploadedAt === null) ||
                    selectedItem.result === 'fail'
                  }
                  onPress={() =>
                    void decide(selectedItem.id, { result: 'fail' })
                  }
                  variant="danger"
                  testID="review-decision-fail"
                  loading={action.busy && pendingResult === 'fail'}
                  pressFeedback="surface"
                  style={decisionStyles.button}
                >
                  {action.busy && pendingResult === 'fail'
                    ? '保存中…'
                    : '不合格'}
                </PrimaryButton>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <AdminField
                  key={reworkDraft.itemId}
                  label="打回理由"
                  value={reworkDraft.reason}
                  onChangeText={(reason) =>
                    setReworkDraft((draft) =>
                      draft?.itemId === reworkDraft.itemId
                        ? { ...draft, reason }
                        : draft,
                    )
                  }
                  disabled={action.busy}
                  multiline
                  visual="route"
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PrimaryButton
                    disabled={
                      action.busy ||
                      resource.loading ||
                      !reworkDraft.reason.trim() ||
                      (!task.decidedAt && selectedItem.uploadedAt === null) ||
                      now >= deadline
                    }
                    onPress={() => {
                      void decide(reworkDraft.itemId, {
                        result: 'rework',
                        reason: reworkDraft.reason.trim(),
                      }).then((saved) => {
                        if (saved) setReworkDraft(null);
                      });
                    }}
                    pressFeedback="surface"
                    loading={action.busy && pendingResult === 'rework'}
                  >
                    {action.busy && pendingResult === 'rework'
                      ? '保存中…'
                      : '确认打回'}
                  </PrimaryButton>
                  <PrimaryButton
                    disabled={action.busy}
                    variant="secondary"
                    onPress={() => setReworkDraft(null)}
                    pressFeedback="surface"
                  >
                    取消
                  </PrimaryButton>
                </View>
              </View>
            )}
            {now >= deadline ? (
              <AdminText>已过打回时间，仅可判通过或不合格。</AdminText>
            ) : null}
          </View>
        ) : undefined
      }
    >
      {task ? (
        <>
          <View testID="review-summary">
            <MobileSurfaceCard>
              <View
                style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}
              >
                <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
                  <MobileText role="fixed" size="lg" numberOfLines={2}>
                    {task.site.name}
                  </MobileText>
                  <MobileText size="sm" tone="muted">
                    {`${task.site.code} · ${task.taskDate}`}
                  </MobileText>
                  <MobileText role="number" size="xs" tone="muted">
                    {`${reviewTime(task.startsAt)}–${reviewTime(task.dueAt)}`}
                  </MobileText>
                  <MobileText size="xs" tone="muted">
                    {`${task.items.length} 个检查项 · ${reviewScore(task)}`}
                  </MobileText>
                </View>
                <View
                  accessibilityLabel={
                    task.score === null
                      ? '巡检分数待判定'
                      : `巡检分数 ${task.score} 分`
                  }
                  style={{
                    alignItems: 'center',
                    borderColor: tokens.mobile.primary,
                    borderRadius: tokens.mobileRadius.pill,
                    borderWidth: 2,
                    height: 72,
                    justifyContent: 'center',
                    width: 72,
                  }}
                >
                  <MobileText role="number" size="2xl" tone="primary">
                    {task.score ?? '—'}
                  </MobileText>
                  {task.score !== null ? (
                    <MobileText role="fixed" size="xs" tone="muted">
                      分
                    </MobileText>
                  ) : null}
                </View>
              </View>
              {task.decidedAt ? (
                <MobileText size="xs" tone="muted">
                  {`判定于 ${reviewTime(task.decidedAt)}，可逐条改判`}
                </MobileText>
              ) : null}
            </MobileSurfaceCard>
          </View>
          {task.items.length === 0 ? (
            <AdminText>此任务没有可判定的检查项。</AdminText>
          ) : null}
          {task.items.map((item) => (
            <ReviewItem
              key={item.id}
              item={item}
              selected={item.id === selectedItem?.id}
              onSelect={() => {
                setSelectedItemId(item.id);
                setReworkDraft(null);
              }}
            />
          ))}
          {task.inspectionId ? (
            <ChatPanel
              inspectionId={task.inspectionId}
              canSend={false}
              variant="legacy"
            />
          ) : null}
        </>
      ) : null}
    </AdminPage>
  );
}
