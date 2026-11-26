import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { BarChart3, ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import type { AdminTodayTask } from '@libs/shared';
import { getAdminToday } from '../../../lib/api/dashboard';
import { reviewApi } from '../../../lib/api/review';
import { MobileStatusTag, MobileText } from '../manager-ui';
import { MobileSurfaceCard } from '../manager-data-ui';
import { AdminPage } from './admin-ui';
import { useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';
import { useTabColors } from '../use-tab-colors';

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

const taskStatusLabels: Record<AdminTodayTask['status'], string> = {
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  overdue: '逾期',
};

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
  const sites = today?.tasks.reduce<
    Record<string, { site: AdminTodayTask['site']; tasks: AdminTodayTask[] }>
  >((groups, task) => {
    const group = groups[task.site.id] ?? { site: task.site, tasks: [] };
    group.tasks.push(task);
    groups[task.site.id] = group;
    return groups;
  }, {});

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

  const pageDate = today
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: today.timezone,
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      }).format(new Date(`${today.date}T12:00:00Z`))
    : undefined;

  return (
    <AdminPage
      title="今日门店"
      loading={resource.loading}
      error={resource.error}
      homeHeader
      homeHeaderMeta={pageDate}
      visual="route"
      showBack={false}
      onRefresh={() => void resource.load()}
    >
      <MobileText size="sm" tone="muted">
        巡检完成与异常情况
      </MobileText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开总部看板"
        accessibilityHint="查看周月汇总、门店、店长和日期趋势"
        onPress={() => router.push('/admin/dashboard')}
        onFocus={() => setDashboardFocused(true)}
        onBlur={() => setDashboardFocused(false)}
        style={({ pressed }) => [
          {
            alignItems: 'center',
            backgroundColor: colors.mobileSurface,
            borderColor: colors.mobileBorder,
            borderRadius: 16,
            borderWidth: dashboardFocused ? 2 : 1,
            flexDirection: 'row',
            justifyContent: 'space-between',
            minHeight: 64,
            paddingHorizontal: 16,
            paddingVertical: 12,
          },
          pressed && { backgroundColor: colors.mobilePressedBackground },
          dashboardFocused && { borderColor: colors.primary },
        ]}
        testID="admin-dashboard-entry"
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
          <BarChart3 color={colors.mobilePrimary} size={22} />
          <View style={{ flex: 1, gap: 2 }}>
            <MobileText role="fixed" size="base">
              总部看板
            </MobileText>
            <MobileText size="xs" tone="muted">
              趋势与巡检分数
            </MobileText>
          </View>
        </View>
        <ChevronRight color={colors.mobileMuted} size={18} />
      </Pressable>
      {today && data ? (
        <>
          <View testID="admin-today-summary">
            <MobileSurfaceCard
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingHorizontal: 8,
                paddingVertical: 16,
              }}
            >
              {[
                ['已完成', today.summary.completed],
                ['预计任务', today.summary.expected],
                ['逾期', today.summary.overdue],
              ].map(([label, value], index) => (
                <View
                  key={label}
                  style={{
                    alignItems: 'center',
                    borderRightColor: colors.mobileBorder,
                    borderRightWidth: index === 2 ? 0 : 1,
                    flex: 1,
                    gap: 4,
                  }}
                >
                  <MobileText role="number" size="2xl">
                    {value}
                  </MobileText>
                  <MobileText role="fixed" size="xs" tone="muted">
                    {label}
                  </MobileText>
                </View>
              ))}
            </MobileSurfaceCard>
          </View>
          <View style={{ gap: 12 }} testID="admin-today-warnings">
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <MobileText role="fixed" size="lg">
                门店现场进度
              </MobileText>
              <MobileText size="xs" tone="muted">
                {`${Object.keys(sites ?? {}).length} 家有今日任务`}
              </MobileText>
            </View>
            {!Object.keys(sites ?? {}).length ? (
              <MobileText size="sm" tone="muted">
                今日无任务
              </MobileText>
            ) : null}
            <View testID="admin-today-tasks">
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
              >
              {Object.values(sites ?? {}).map(({ site, tasks }) => {
                const completed = tasks.filter(
                  (task) => task.status === 'submitted',
                ).length;
                const overdue = tasks.filter(
                  (task) => task.status === 'overdue',
                ).length;
                return (
                  <MobileSurfaceCard
                    key={site.id}
                    style={{ flexBasis: '48%', flexGrow: 1, gap: 8 }}
                  >
                    <View
                      style={{
                        alignItems: 'flex-start',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <MobileText role="fixed" size="base" numberOfLines={2}>
                        {`${site.name}${site.active ? '' : ' · 已停用'}`}
                      </MobileText>
                      <MobileText role="number" size="lg">
                        {`${completed} / ${tasks.length}`}
                      </MobileText>
                    </View>
                    <MobileText size="xs" tone="muted">
                      {`逾期 ${overdue} 项 · 今日完成 / 计划`}
                    </MobileText>
                    <View style={{ gap: 4 }}>
                      {tasks.map((task) => (
                        <View key={task.id} testID={`today-task-${task.id}`}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`查看 ${site.name} ${task.templateName} 任务`}
                            onPress={() => openTask(task.id)}
                            style={({ pressed }) => ({
                              backgroundColor: pressed
                                ? colors.mobilePressedBackground
                                : 'transparent',
                              borderTopColor: colors.mobileBorder,
                              borderTopWidth: 1,
                              gap: 4,
                              paddingVertical: 8,
                            })}
                          >
                            <View
                              style={{
                                alignItems: 'center',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                gap: 4,
                              }}
                            >
                              <MobileText
                                size="xs"
                                numberOfLines={1}
                                style={{ flex: 1 }}
                              >
                                {task.templateName}
                              </MobileText>
                              {task.criticalFailure || task.status === 'overdue' ? (
                                <View
                                  style={{ flexDirection: 'row' }}
                                  testID={`warning-${task.id}`}
                                >
                                  {task.criticalFailure ? (
                                    <MobileStatusTag
                                      status="failed"
                                      label="严重项不合格"
                                    />
                                  ) : null}
                                  {task.status === 'overdue' ? (
                                    <MobileStatusTag
                                      status="overdue"
                                      label="任务逾期"
                                    />
                                  ) : null}
                                </View>
                              ) : (
                                <MobileStatusTag
                                  status={task.status}
                                  label={taskStatusLabels[task.status]}
                                />
                              )}
                            </View>
                            <MobileText role="number" size="xs" tone="muted" numberOfLines={1}>
                              {`${time(task.startsAt)}–${time(task.dueAt)} · ${task.score === null ? '—' : `${task.score} 分`}`}
                            </MobileText>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </MobileSurfaceCard>
                );
              })}
              </View>
            </View>
          </View>
          <View style={{ gap: 8 }} testID="admin-today-pending">
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <MobileText role="fixed" size="lg">
                待处理现场
              </MobileText>
              <MobileText size="xs" tone="muted">
                审核队列
              </MobileText>
            </View>
            {data.pending.length === 0 ? (
              <MobileText size="sm" tone="muted">
                暂无待人工审核任务
              </MobileText>
            ) : (
              data.pending.map((task) => (
                <View key={task.id} testID={`pending-task-${task.id}`}>
                  <Link
                    href={{
                      pathname: '/admin/review/[id]',
                      params: { id: task.id, returnTo: 'today' },
                    }}
                    asChild
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="处理任务"
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: pressed
                          ? colors.mobilePressedBackground
                          : colors.mobileSurface,
                        borderColor: colors.mobileBorder,
                        borderRadius: 16,
                        borderWidth: 1,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        minHeight: 64,
                        padding: 12,
                      })}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <MobileText
                          role="fixed"
                          size="base"
                          numberOfLines={1}
                        >
                          {task.templateName}
                        </MobileText>
                        <MobileText
                          size="xs"
                          tone="muted"
                          numberOfLines={1}
                        >
                          {`${task.site.name} · ${task.taskDate}`}
                        </MobileText>
                      </View>
                      <MobileStatusTag status="pending" label="待人工" />
                    </Pressable>
                  </Link>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </AdminPage>
  );
}
