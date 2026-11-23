import { useRouter } from 'expo-router';
import type { TaskReview } from '@libs/shared';
import { reviewApi } from '../../../lib/api/review';
import { PrimaryButton } from '../primary-button';
import { AdminCard, AdminPage, AdminText } from './admin-ui';
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

  function renderTasks(tasks: TaskReview[], pending: boolean) {
    return tasks.length === 0 ? (
      <AdminText>
        {pending ? '当前没有待人工任务。' : '今天还没有已判定任务。'}
      </AdminText>
    ) : (
      tasks.map((task) => (
        <AdminCard key={task.id} testID={`review-task-${task.id}`}>
          <AdminText>{task.site.name}</AdminText>
          <AdminText>{`${task.site.code} · ${task.templateName} · ${task.taskDate}`}</AdminText>
          <AdminText>
            {pending
              ? `提交于 ${reviewTime(task.submittedAt ?? task.items.find((item) => item.uploadedAt)?.uploadedAt ?? task.createdAt)}`
              : `判定于 ${reviewTime(task.decidedAt)}`}
          </AdminText>
          <AdminText>{reviewScore(task)}</AdminText>
          {pending
            ? task.items
                .filter(
                  (item) =>
                    item.result === 'pending' &&
                    item.aiReviewStatus === 'manual',
                )
                .map((item) => (
                  <AdminText key={item.id}>
                    {`${item.title}：${item.aiReason ?? '等待管理员人工判定。'}`}
                  </AdminText>
                ))
            : null}
          <PrimaryButton
            onPress={() =>
              router.push({
                pathname: '/admin/review/[id]',
                params: { id: task.id, returnTo: 'review' },
              })
            }
          >
            查看任务
          </PrimaryButton>
        </AdminCard>
      ))
    );
  }

  return (
    <AdminPage
      title="审核队列"
      loading={resource.loading}
      error={resource.error}
      onRefresh={() => void resource.load()}
    >
      {!resource.loading || resource.data.length > 0 ? (
        <>
          <AdminText>{`待人工 · ${manual.length} 个任务`}</AdminText>
          {renderTasks(manual, true)}
          <AdminText>今天已判定</AdminText>
          {renderTasks(decided, false)}
        </>
      ) : null}
    </AdminPage>
  );
}
