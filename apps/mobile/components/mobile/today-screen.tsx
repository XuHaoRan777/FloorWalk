import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Bell, Check, RefreshCw } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InspectorTodayTask, TodayResponse } from '@libs/shared';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';
import { BrandMark } from './brand-mark';
import { EmptyIllustration } from './empty-illustration';
import { useTabColors } from './use-tab-colors';
import { todayStyles } from './today-screen.styles';
import { formatLocalDate, formatTimeWindow } from './today-format';
import { TodayProgress } from './today-progress';
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
  unreadCount,
  onRefresh,
  onOpenNotifications,
  onOpenTask,
}: {
  today: TodayResponse | null;
  todayError: string | null;
  unreadCount: number;
  onRefresh: () => void;
  onOpenNotifications: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const tasks = today?.tasks ?? [];
  const colors = useTabColors();
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

  return (
    <SafeAreaView
      className={classes.mobileBackground}
      edges={['top']}
      style={{ flex: 1 }}
    >
      <View
        className={`${classes.mobileSurface} border-b ${classes.mobileBorder}`}
        style={todayStyles.brandBar}
      >
        <View style={todayStyles.brandLockup}>
          <BrandMark size={28} />
          <Text
            className={classes.mobileForeground}
            style={todayStyles.brandName}
          >
            FloorWalk
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`通知${unreadCount > 0 ? `，${unreadCount} 条未读` : ''}`}
          accessibilityRole="button"
          onPress={onOpenNotifications}
          onFocus={() => setFocusedControl('notifications')}
          onBlur={() => setFocusedControl(null)}
          style={({ pressed }) => [
            todayStyles.notifications,
            focusedControl === 'notifications' && {
              borderWidth: 2,
              borderColor: colors.primary,
            },
            pressed && { backgroundColor: colors.mobilePressedBackground },
          ]}
          testID="home-notifications"
        >
          <Bell color={colors.primary} size={21} />
          {unreadCount > 0 ? (
            <View
              className={classes.notificationBadge}
              style={[todayStyles.badge, { borderColor: colors.surface }]}
            >
              <Text
                className={classes.notificationBadgeText}
                style={todayStyles.badgeText}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {today ? (
        <FlatList
          className={classes.mobileBackground}
          contentContainerStyle={[styles.page, todayStyles.page]}
          data={tasks}
          extraData={focusedTaskId}
          keyExtractor={(task) => task.id}
          ListFooterComponent={
            nextTask ? (
              <View style={todayStyles.resume}>
                <View style={todayStyles.resumeHeading}>
                  <Text className={classes.mobileMuted} style={styles.muted}>
                    从这里继续
                  </Text>
                  <Text className={classes.mobileMuted} style={styles.muted}>
                    第 {nextTaskIndex + 1} 项
                  </Text>
                </View>
                <PrimaryButton
                  accessibilityHint="打开当前可继续的巡检任务"
                  onPress={() => onOpenTask(nextTask.id)}
                  pressFeedback="surface"
                  style={todayStyles.resumeButton}
                  testID="today-resume-task"
                >
                  {`打开${nextTask.templateName}`}
                </PrimaryButton>
              </View>
            ) : tasks.length > 0 ? (
              <View style={todayStyles.resume}>
                <Text className={classes.mobileForeground} style={styles.muted}>
                  今日无可继续的任务
                </Text>
                <Text className={classes.mobileMuted} style={styles.muted}>
                  已提交或逾期任务可在上方查看，打回事项可在通知中处理。
                </Text>
                <PrimaryButton
                  onPress={onOpenNotifications}
                  pressFeedback="surface"
                  style={todayStyles.resumeButton}
                  variant="secondary"
                >
                  查看通知
                </PrimaryButton>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <View className={classes.empty} style={todayStyles.empty}>
              <EmptyIllustration variant="today" mobile />
              <Text
                className={classes.mobileForeground}
                style={todayStyles.emptyTitle}
              >
                今天没有巡检任务。
              </Text>
              <Text className={classes.mobileMuted} style={styles.muted}>
                有新安排时会显示在这里。
              </Text>
              <PrimaryButton
                onPress={onOpenNotifications}
                pressFeedback="surface"
                style={todayStyles.resumeButton}
                variant="secondary"
              >
                查看通知
              </PrimaryButton>
            </View>
          }
          ListHeaderComponent={
            <View style={{ gap: tokens.space.md }}>
              <View style={todayStyles.pageHeader}>
                <View style={{ flex: 1 }}>
                  <Text className={classes.mobileMuted} style={styles.eyebrow}>
                    今日任务
                  </Text>
                  <Text
                    accessibilityRole="header"
                    className={classes.mobileForeground}
                    style={todayStyles.heading}
                  >
                    {today.site.name}
                  </Text>
                  <Text
                    className={classes.mobileMuted}
                    style={todayStyles.date}
                  >
                    {formatLocalDate(new Date().toISOString(), today.timezone)}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="刷新今日任务"
                  accessibilityRole="button"
                  onPress={onRefresh}
                  onFocus={() => setFocusedControl('refresh')}
                  onBlur={() => setFocusedControl(null)}
                  style={({ pressed }) => [
                    todayStyles.refresh,
                    focusedControl === 'refresh' && {
                      borderWidth: 2,
                      borderColor: colors.primary,
                    },
                    pressed && {
                      backgroundColor: colors.mobilePressedBackground,
                    },
                  ]}
                  testID="refresh-today"
                >
                  <RefreshCw color={colors.primary} size={16} />
                  <Text
                    className={classes.mobileForeground}
                    style={styles.link}
                  >
                    刷新
                  </Text>
                </Pressable>
              </View>
              <ErrorBanner message={todayError} />
              {tasks.length > 0 ? <TodayProgress tasks={tasks} /> : null}
              {tasks.length > 0 ? (
                <View
                  style={[
                    todayStyles.listHeading,
                    { borderTopColor: colors.mobileBorder },
                  ]}
                >
                  <Text
                    className={classes.mobileForeground}
                    style={todayStyles.cardTitle}
                  >
                    今日安排
                  </Text>
                  <Text className={classes.mobileMuted} style={styles.muted}>
                    {tasks.length} 项
                  </Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityLabel={`查看 ${item.templateName} 任务详情`}
              accessibilityRole="button"
              accessibilityHint="打开任务检查项和时间状态"
              onPress={() => onOpenTask(item.id)}
              onFocus={() => setFocusedTaskId(item.id)}
              onBlur={() => setFocusedTaskId(null)}
              style={({ pressed }) => [
                todayStyles.taskRow,
                { borderBottomColor: colors.mobileBorder },
                pressed && { backgroundColor: colors.mobilePressedBackground },
                focusedTaskId === item.id && {
                  borderWidth: 2,
                  borderColor: colors.primary,
                  borderRadius: 8,
                },
              ]}
              testID={`today-task-${item.id}`}
            >
              <View
                pointerEvents="none"
                style={[
                  todayStyles.routeLine,
                  { backgroundColor: colors.mobileRoute },
                ]}
              />
              <View
                style={[
                  todayStyles.taskNode,
                  {
                    borderColor: colors.mobileBorder,
                    backgroundColor: colors.mobileBackground,
                  },
                  item.status === 'submitted' && {
                    backgroundColor: colors.mobileSuccessBackground,
                    borderColor: colors.mobileSuccess,
                  },
                  item.status === 'in_progress' && {
                    borderColor: colors.mobileRouteStrong,
                    ...todayStyles.taskNodeCurrent,
                  },
                  item.status === 'overdue' && {
                    backgroundColor: colors.mobileWarningBackground,
                    borderColor: colors.mobileWarning,
                  },
                ]}
              >
                {item.status === 'submitted' ? (
                  <Check color={colors.mobileSuccess} size={14} />
                ) : (
                  <Text
                    className={classes.mobileMuted}
                    style={todayStyles.taskNumber}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <View style={todayStyles.taskCopy}>
                <Text
                  className={classes.mobileForeground}
                  style={todayStyles.cardTitle}
                >
                  {item.templateName}
                </Text>
                <Text className={classes.mobileMuted} style={styles.muted}>
                  {formatTimeWindow(item, today.timezone)}
                </Text>
              </View>
              <Text
                className={
                  item.status === 'submitted'
                    ? classes.mobileSuccessText
                    : item.status === 'overdue'
                      ? classes.mobileWarningTitle
                      : classes.mobileMuted
                }
                style={todayStyles.taskStatus}
              >
                状态：{statusLabels[item.status]}
              </Text>
            </Pressable>
          )}
          testID="today-task-list"
        />
      ) : (
        <ScrollView
          className={classes.mobileBackground}
          contentContainerStyle={[styles.centered, todayStyles.page]}
        >
          {todayError ? (
            <>
              <ErrorBanner message={todayError} />
              <PrimaryButton onPress={onRefresh} variant="secondary">
                重新加载
              </PrimaryButton>
            </>
          ) : (
            <Text className={classes.muted} style={styles.description}>
              正在加载今日任务…
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
