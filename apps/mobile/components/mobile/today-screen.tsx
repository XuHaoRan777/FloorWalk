import { useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Bell, RefreshCw } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InspectorTodayTask, TodayResponse } from '@libs/shared';
import { ErrorBanner } from './error-banner';
import { BrandMark } from './brand-mark';
import { EmptyIllustration } from './empty-illustration';
import {
  MobileButton,
  MobileStatusTag,
  MobileText,
  MobileTopBar,
} from './manager-ui';
import {
  MobileEmptyState,
  MobileSurfaceCard,
} from './manager-data-ui';
import { MobileTaskRow } from './manager-task-ui';
import { TodayProgress } from './today-progress';
import { formatLocalDate, formatTimeWindow } from './today-format';
import { todayStyles } from './today-screen.styles';
import tokens from '../../../../packages/tokens/native.json';

const statusLabels: Record<InspectorTodayTask['status'], string> = {
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  overdue: '逾期',
};

export function TodayScreen({
  today,
  todayError,
  managerName,
  unreadCount,
  onRefresh,
  onOpenNotifications,
  onOpenTask,
}: {
  today: TodayResponse | null;
  todayError: string | null;
  managerName: string;
  unreadCount: number;
  onRefresh: () => void;
  onOpenNotifications: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const tasks = today?.tasks ?? [];
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const resumeTaskIndex = tasks.findIndex(
    (task) => task.status === 'in_progress',
  );
  const nextTaskIndex =
    resumeTaskIndex >= 0
      ? resumeTaskIndex
      : tasks.findIndex((task) => task.status === 'not_started');
  const nextTask = tasks[nextTaskIndex];

  const trailing = (
    <View style={todayStyles.headerActions}>
      <Pressable
        accessibilityLabel="刷新今日任务"
        accessibilityRole="button"
        onPress={onRefresh}
        onFocus={() => setFocusedControl('refresh')}
        onBlur={() => setFocusedControl(null)}
        style={[
          todayStyles.headerButton,
          focusedControl === 'refresh' && todayStyles.focusedHeaderButton,
        ]}
        testID="refresh-today"
      >
        <RefreshCw color={tokens.mobile.primary} size={18} />
      </Pressable>
      <Pressable
        accessibilityLabel={`通知${unreadCount > 0 ? `，${unreadCount} 条未读` : ''}`}
        accessibilityRole="button"
        onPress={onOpenNotifications}
        onFocus={() => setFocusedControl('notifications')}
        onBlur={() => setFocusedControl(null)}
        style={[
          todayStyles.headerButton,
          focusedControl === 'notifications' &&
            todayStyles.focusedHeaderButton,
        ]}
        testID="home-notifications"
      >
        <Bell color={tokens.mobile.primary} size={20} />
        {unreadCount > 0 ? (
          <View style={todayStyles.badge}>
            <MobileText role="number" size="xs" tone="foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </MobileText>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  const header = (
    <View style={todayStyles.listHeader}>
      <View style={todayStyles.pageHeading}>
        <View style={todayStyles.pageHeadingText}>
          <MobileText role="title" size="2xl">
            今日待巡
          </MobileText>
          <MobileText role="number" size="sm" tone="muted">
            {today
              ? formatLocalDate(new Date().toISOString(), today.timezone)
              : ''}
          </MobileText>
        </View>
        {tasks.length > 0 ? (
          <MobileText role="number" size="lg" tone="primary">
            {String(tasks.filter((task) => task.status === 'submitted').length)
              .padStart(2, '0')}{' '}
            / {String(tasks.length).padStart(2, '0')}
          </MobileText>
        ) : null}
      </View>
      {tasks.length > 0 ? <TodayProgress tasks={tasks} /> : null}
      {nextTask ? (
        <MobileSurfaceCard style={todayStyles.resumeCard}>
          <View style={todayStyles.resumeHeading}>
            <MobileStatusTag
              status={nextTask.status}
              label={
                nextTask.status === 'in_progress'
                  ? '正在巡检'
                  : '可开始巡检'
              }
            />
            <MobileText role="number" size="xs" tone="muted">
              第 {nextTaskIndex + 1} 项
            </MobileText>
          </View>
          <View style={todayStyles.resumeCopy}>
            <MobileText size="lg" numberOfLines={2}>
              {nextTask.templateName}
            </MobileText>
            <MobileText role="number" size="sm" tone="muted">
              {formatTimeWindow(nextTask, today?.timezone ?? 'Asia/Shanghai')}
            </MobileText>
          </View>
          <MobileButton
            accessibilityHint="打开当前可继续的巡检任务"
            onPress={() => onOpenTask(nextTask.id)}
            testID="today-resume-task"
            style={todayStyles.resumeButton}
          >
            继续巡检
          </MobileButton>
        </MobileSurfaceCard>
      ) : tasks.length > 0 ? (
        <MobileSurfaceCard style={todayStyles.resumeCard}>
          <MobileText role="fixed" size="base">
            今日无可继续的任务
          </MobileText>
          <MobileText size="sm" tone="muted">
            已提交或逾期任务可在上方查看，打回事项可在通知中处理。
          </MobileText>
          <MobileButton
            onPress={onOpenNotifications}
            variant="secondary"
            style={todayStyles.resumeButton}
          >
            查看通知
          </MobileButton>
        </MobileSurfaceCard>
      ) : null}
      {tasks.length > 0 ? (
        <View style={todayStyles.taskHeading}>
          <MobileText role="fixed" size="base">
            今日安排
          </MobileText>
          <MobileText size="sm" tone="muted">
            按开始时间
          </MobileText>
        </View>
      ) : null}
      <ErrorBanner message={todayError} />
    </View>
  );

  return (
    <SafeAreaView style={todayStyles.screen} edges={['top']}>
      <MobileTopBar
        title={today?.site.name ?? 'FloorWalk'}
        titleRole={today ? 'body' : 'title'}
        titleSize="base"
        subtitle={managerName ? `店长 ${managerName}` : '店长'}
        leading={<BrandMark size={30} />}
        trailing={trailing}
      />
      {today ? (
        <FlatList
          contentContainerStyle={todayStyles.page}
          data={tasks}
          extraData={focusedTaskId}
          keyExtractor={(task) => task.id}
          ListEmptyComponent={
            <MobileEmptyState
              title="今天没有巡检任务。"
              description="有新安排时会显示在这里。"
              icon={<EmptyIllustration variant="today" mobile />}
              action={
                <MobileButton
                  onPress={onOpenNotifications}
                  variant="secondary"
                  style={todayStyles.resumeButton}
                >
                  查看通知
                </MobileButton>
              }
              style={todayStyles.emptyState}
            />
          }
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <MobileTaskRow
              accessibilityLabel={`查看 ${item.templateName} 任务详情`}
              description={formatTimeWindow(item, today.timezone)}
              focused={focusedTaskId === item.id}
              onBlur={() => setFocusedTaskId(null)}
              onFocus={() => setFocusedTaskId(item.id)}
              onPress={() => onOpenTask(item.id)}
              status={item.status}
              statusLabel={`状态：${statusLabels[item.status]}`}
              testID={`today-task-${item.id}`}
              time={new Intl.DateTimeFormat('zh-CN', {
                timeZone: today.timezone,
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              }).format(new Date(item.startsAt))}
              title={item.templateName}
            />
          )}
          testID="today-task-list"
        />
      ) : (
        <ScrollView contentContainerStyle={todayStyles.loading}>
          {todayError ? (
            <>
              <ErrorBanner message={todayError} />
              <MobileButton onPress={onRefresh} variant="secondary">
                重新加载
              </MobileButton>
            </>
          ) : (
            <MobileText size="base" tone="muted">
              正在加载今日任务…
            </MobileText>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
