import { useRouter } from 'expo-router';
import { useState } from 'react';
import { BarChart3, ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import type { AdminTodayResponse } from '@libs/shared';
import { getAdminToday } from '../../../lib/api/dashboard';
import { reviewApi } from '../../../lib/api/review';
import { PrimaryButton } from '../primary-button';
import { AdminCard, AdminPage, AdminText } from './admin-ui';
import { useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';
import { useTabColors } from '../use-tab-colors';

const taskLabels = {
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  overdue: '逾期',
};

async function loadToday() {
  const [today, queue] = await Promise.all([
    getAdminToday(),
    reviewApi.queue(),
  ]);
  return {
    today,
    pending: queue.filter((task) =>
      task.items.some(
        (item) => item.result === 'pending' && item.aiReviewStatus === 'manual',
      ),
    ),
  };
}

export function AdminTodayScreen() {
  const router = useRouter();
  const colors = useTabColors();
  const [dashboardFocused, setDashboardFocused] = useState(false);
  const resource = useAdminResource(
    loadToday,
    null as Awaited<ReturnType<typeof loadToday>> | null,
  );
  useAdminFocus(resource.load, true);
  const data = resource.data;
  const today = data?.today;
  const warnings = today?.tasks.filter(
    (task) => task.criticalFailure || task.status === 'overdue',
  );
  function time(value: string) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: today?.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }
  function openTask(id: string) {
    router.push({
      pathname: '/admin/review/[id]',
      params: { id, returnTo: 'today' },
    });
  }

  return (
    <AdminPage
      title="今日视图"
      loading={resource.loading}
      error={resource.error}
      homeHeader
      showBack={false}
      onRefresh={() => void resource.load()}
    >
      {today ? (
        <AdminText>{`${today.date} · ${today.timezone}`}</AdminText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开总部看板"
        accessibilityHint="查看周月汇总、门店、店长和日期趋势"
        className="flex-row items-center justify-between rounded-xl border border-mobile-border bg-mobile-surface px-4 py-3 active:bg-mobile-pressed-background"
        onPress={() => router.push('/admin/dashboard')}
        onFocus={() => setDashboardFocused(true)}
        onBlur={() => setDashboardFocused(false)}
        style={[
          { minHeight: 64 },
          dashboardFocused && {
            borderWidth: 2,
            borderColor: colors.primary,
          },
        ]}
        testID="admin-dashboard-entry"
      >
        <View className="flex-row items-center gap-3">
          <BarChart3 color={colors.primary} size={22} />
          <View>
            <AdminText>总部看板</AdminText>
            <AdminText>完成率、逾期、自检准确率与分数</AdminText>
          </View>
        </View>
        <ChevronRight color={colors.mutedForeground} size={18} />
      </Pressable>
      {today && data ? (
        <>
          <AdminCard testID="admin-today-summary">
            <AdminText>{`应完成 ${today.summary.expected}`}</AdminText>
            <AdminText>{`已完成 ${today.summary.completed}`}</AdminText>
            <AdminText>{`逾期 ${today.summary.overdue}`}</AdminText>
          </AdminCard>
          <AdminCard testID="admin-today-warnings">
            <AdminText>警告</AdminText>
            {!warnings?.length ? <AdminText>今日暂无警告</AdminText> : null}
            {warnings?.map((task) => (
              <AdminCard key={task.id} testID={`warning-${task.id}`}>
                <AdminText>{`${task.site.name} · ${task.templateName}`}</AdminText>
                <AdminText>
                  {[
                    task.criticalFailure && '严重项不合格',
                    task.status === 'overdue' && '任务逾期',
                  ]
                    .filter(Boolean)
                    .join('、')}
                </AdminText>
                <PrimaryButton onPress={() => openTask(task.id)}>
                  查看任务
                </PrimaryButton>
              </AdminCard>
            ))}
          </AdminCard>
          <AdminCard testID="admin-today-tasks">
            <AdminText>各店今日任务</AdminText>
            {today.tasks.length === 0 ? (
              <AdminText>今日无任务</AdminText>
            ) : null}
            {today.tasks.map((task: AdminTodayResponse['tasks'][number]) => (
              <AdminCard key={task.id} testID={`today-task-${task.id}`}>
                <AdminText>{`${task.site.name}${task.site.active ? '' : ' · 已停用'}`}</AdminText>
                <AdminText>{task.templateName}</AdminText>
                <AdminText>{`${time(task.startsAt)}–${time(task.dueAt)}`}</AdminText>
                <AdminText>{taskLabels[task.status]}</AdminText>
                <AdminText>
                  {task.score === null ? '—' : `${task.score} 分`}
                </AdminText>
              </AdminCard>
            ))}
          </AdminCard>
          <AdminCard testID="admin-today-pending">
            <AdminText>待我处理</AdminText>
            {data.pending.length === 0 ? (
              <AdminText>暂无待人工审核任务</AdminText>
            ) : null}
            {data.pending.map((task) => (
              <AdminCard key={task.id} testID={`pending-task-${task.id}`}>
                <AdminText>{`${task.site.name} · ${task.templateName} · ${task.taskDate}`}</AdminText>
                <PrimaryButton onPress={() => openTask(task.id)}>
                  处理任务
                </PrimaryButton>
              </AdminCard>
            ))}
          </AdminCard>
        </>
      ) : null}
    </AdminPage>
  );
}
