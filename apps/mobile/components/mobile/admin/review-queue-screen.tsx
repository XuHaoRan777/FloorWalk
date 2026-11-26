import { useRouter } from 'expo-router';
import type { TaskReview } from '@libs/shared';
import { Pressable, View } from 'react-native';
import tokens from '../../../../../packages/tokens/native.json';
import { reviewApi } from '../../../lib/api/review';
import { MobileStatusTag, MobileText } from '../manager-ui';
import { MobileSurfaceCard } from '../manager-data-ui';
import { AdminPage } from './admin-ui';
import { reviewScore, reviewTime } from './review-format';
import { useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';

export function ReviewQueueScreen() {
  const resource = useAdminResource(reviewApi.queue, [] as TaskReview[]);
  const router = useRouter();
  useAdminFocus(resource.load, true);
  const manual = resource.data.filter((task) =>
    task.items.some(
      (item) => item.result === 'pending' && item.aiReviewStatus === 'manual',
    ),
  );
  const decided = resource.data.filter((task) => task.decidedAt !== null);
  const pageDate = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());

  function openTask(id: string) {
    router.push({
      pathname: '/admin/review/[id]',
      params: { id, returnTo: 'review' },
    });
  }

  function renderTasks(tasks: TaskReview[], pending: boolean) {
    return tasks.length === 0 ? (
      <MobileText size="sm" tone="muted">
        {pending ? '当前没有待人工任务。' : '今天还没有已判定任务。'}
      </MobileText>
    ) : (
      tasks.map((task) => {
        const contributorNames = [
          ...new Set(
            task.items
              .map((item) => item.uploadedByName)
              .filter((name): name is string => name !== null),
          ),
        ];
        const uploadedAt = task.items.find(
          (item) => item.uploadedAt !== null,
        )?.uploadedAt;
        const dateLabel = pending
          ? `提交于 ${reviewTime(task.submittedAt ?? uploadedAt ?? task.createdAt)}`
          : `判定于 ${reviewTime(task.decidedAt)}`;

        return (
          <View key={task.id} testID={`review-task-${task.id}`}>
            <MobileSurfaceCard style={{ gap: 10 }}>
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <MobileText role="fixed" size="lg" numberOfLines={2}>
                  {task.templateName}
                </MobileText>
                {pending ? (
                  <MobileStatusTag status="pending" label="待处理" />
                ) : (
                  <MobileStatusTag
                    status={
                      task.inspectionStatus === 'passed'
                        ? 'completed'
                        : task.inspectionStatus === 'failed'
                          ? 'failed'
                          : 'pending'
                    }
                    label={
                      task.inspectionStatus === 'passed'
                        ? '已通过'
                        : task.inspectionStatus === 'failed'
                          ? '不合格'
                          : '已判定'
                    }
                  />
                )}
              </View>
              <MobileText size="sm" tone="muted">
                {`${task.site.name}${contributorNames.length ? ` · ${contributorNames.join('、')}` : ''}`}
              </MobileText>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  rowGap: 4,
                }}
              >
                <MobileText role="number" size="xs" tone="muted">
                  {`${task.taskDate} · ${dateLabel}`}
                </MobileText>
                <MobileText role="number" size="xs" tone="muted">
                  {reviewScore(task)}
                </MobileText>
                <MobileText size="xs" tone="muted">
                  {`${task.items.length} 个检查项`}
                </MobileText>
              </View>
              {pending
                ? task.items
                    .filter(
                      (item) =>
                        item.result === 'pending' &&
                        item.aiReviewStatus === 'manual',
                    )
                    .map((item) => (
                      <View
                        key={item.id}
                        style={{
                          borderTopColor: tokens.mobile.border,
                          borderTopWidth: 1,
                          gap: 2,
                          paddingTop: 8,
                        }}
                      >
                        <MobileText role="fixed" size="sm">
                          {item.title}
                        </MobileText>
                        <MobileText size="xs" tone="muted">
                          {item.aiReason ?? '等待管理员人工判定。'}
                        </MobileText>
                      </View>
                    ))
                : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => openTask(task.id)}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed
                    ? tokens.mobile.pressedBackground
                    : 'transparent',
                  borderRadius: 10,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  minHeight: 44,
                  paddingHorizontal: 8,
                })}
              >
                <MobileText role="fixed" size="sm" tone="primary">
                  查看任务
                </MobileText>
              </Pressable>
            </MobileSurfaceCard>
          </View>
        );
      })
    );
  }

  return (
    <AdminPage
      title="审核"
      loading={resource.loading}
      error={resource.error}
      homeHeader
      homeHeaderLabel="商家巡检管理"
      homeHeaderMeta={pageDate}
      showBack={false}
      visual="route"
      onRefresh={() => void resource.load()}
    >
      <MobileText size="sm" tone="muted">
        逐项查看照片与结论
      </MobileText>
      <View style={{ gap: 12 }}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <MobileText role="fixed" size="lg">
            待处理
          </MobileText>
          <MobileText role="number" size="xs" tone="muted">
            {`${manual.length} 项`}
          </MobileText>
        </View>
        {renderTasks(manual, true)}
      </View>
      <View style={{ gap: 12 }}>
        <MobileText role="fixed" size="lg">
          今天已判定
        </MobileText>
        {renderTasks(decided, false)}
      </View>
    </AdminPage>
  );
}
