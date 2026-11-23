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
import tokens from '../../../../packages/tokens/native.json';

const statusLabels: Record<InspectorTodayTask['status'], string> = {
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  overdue: '逾期',
};

function formatLocalDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatLocalTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function formatTimeWindow(task: InspectorTodayTask, timezone: string) {
  const starts = formatLocalTime(task.startsAt, timezone);
  const ends = formatLocalTime(task.dueAt, timezone);
  const crossesMidnight =
    formatLocalDate(task.startsAt, timezone) !==
    formatLocalDate(task.dueAt, timezone);
  return `${starts}～${crossesMidnight ? '次日 ' : ''}${ends}`;
}

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
  const resumeTaskIndex = tasks.findIndex(
    (task) => task.status === 'in_progress',
  );
  const nextTaskIndex =
    resumeTaskIndex >= 0
      ? resumeTaskIndex
      : tasks.findIndex(
          (task) => task.status === 'not_started' || task.status === 'overdue',
        );
  const nextTask = tasks[nextTaskIndex];
  const completed = tasks.filter((task) => task.status === 'submitted').length;
  const inProgress = tasks.filter(
    (task) => task.status === 'in_progress',
  ).length;
  const overdue = tasks.filter((task) => task.status === 'overdue').length;
  const notStarted = tasks.filter(
    (task) => task.status === 'not_started',
  ).length;

  return (
    <SafeAreaView
      className={classes.background}
      edges={['top']}
      style={{ flex: 1 }}
    >
      <View
        className="border-b border-border bg-card"
        style={[todayStyles.brandBar, { borderBottomColor: colors.border }]}
      >
        <View style={todayStyles.brandLockup}>
          <BrandMark size={28} />
          <Text className={classes.foreground} style={todayStyles.brandName}>
            FloorWalk
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`通知${unreadCount > 0 ? `，${unreadCount} 条未读` : ''}`}
          accessibilityRole="button"
          onPress={onOpenNotifications}
          style={({ pressed }) => [
            todayStyles.notifications,
            pressed && styles.pressedRow,
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
          className={classes.background}
          contentContainerStyle={styles.page}
          data={tasks}
          keyExtractor={(task) => task.id}
          ListFooterComponent={
            nextTask ? (
              <View style={todayStyles.resume}>
                <View style={todayStyles.resumeHeading}>
                  <Text className={classes.muted} style={styles.muted}>
                    从这里继续
                  </Text>
                  <Text className={classes.muted} style={styles.muted}>
                    第 {nextTaskIndex + 1} 项
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="打开当前可继续的巡检任务"
                  className={`${classes.primaryButton} ${classes.pressMotion}`}
                  onPress={() => onOpenTask(nextTask.id)}
                  pressRetentionOffset={{
                    top: 8,
                    right: 8,
                    bottom: 8,
                    left: 8,
                  }}
                  style={todayStyles.resumeButton}
                  testID="today-resume-task"
                >
                  <Text
                    className={classes.primaryButtonText}
                    style={styles.buttonText}
                  >
                    {`打开${nextTask.templateName}`}
                  </Text>
                </Pressable>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <View className={classes.empty} style={todayStyles.empty}>
              <EmptyIllustration variant="today" />
              <Text
                className={classes.foreground}
                style={todayStyles.emptyTitle}
              >
                今天没有巡检任务。
              </Text>
              <Text className={classes.muted} style={styles.muted}>
                有新安排时会显示在这里。
              </Text>
            </View>
          }
          ListHeaderComponent={
            <View style={{ gap: tokens.space.md }}>
              <View style={todayStyles.pageHeader}>
                <View style={{ flex: 1 }}>
                  <Text className={classes.eyebrow} style={styles.eyebrow}>
                    今日任务
                  </Text>
                  <Text
                    accessibilityRole="header"
                    className={classes.foreground}
                    style={styles.heading}
                  >
                    {today.site.name}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="刷新今日任务"
                  accessibilityRole="button"
                  onPress={onRefresh}
                  style={({ pressed }) => [
                    todayStyles.refresh,
                    pressed && styles.pressedRow,
                  ]}
                  testID="refresh-today"
                >
                  <RefreshCw color={colors.primary} size={16} />
                  <Text className={classes.link} style={styles.link}>
                    刷新
                  </Text>
                </Pressable>
              </View>
              <ErrorBanner message={todayError} />
              {tasks.length > 0 ? (
                <View
                  accessibilityLabel={`今日任务已完成 ${completed} 项，进行中 ${inProgress} 项，逾期 ${overdue} 项，未开始 ${notStarted} 项`}
                  style={todayStyles.progress}
                  testID="today-progress"
                >
                  <View style={todayStyles.progressHeading}>
                    <Text
                      className={classes.foreground}
                      style={styles.cardTitle}
                    >
                      今日进度
                    </Text>
                    <Text
                      className={classes.muted}
                      style={todayStyles.progressCount}
                    >
                      {completed} / {tasks.length} 已完成
                    </Text>
                  </View>
                  <View
                    accessibilityElementsHidden
                    style={todayStyles.progressTrack}
                  >
                    {tasks.map((task) => (
                      <View
                        key={task.id}
                        style={[
                          todayStyles.progressSegment,
                          {
                            backgroundColor:
                              task.status === 'submitted'
                                ? colors.successMark
                                : task.status === 'in_progress'
                                  ? colors.primary
                                  : task.status === 'overdue'
                                    ? colors.warning
                                    : colors.border,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text
                    className={classes.muted}
                    style={todayStyles.progressLegend}
                  >
                    {[
                      completed > 0 ? `已完成 ${completed}` : null,
                      inProgress > 0 ? `进行中 ${inProgress}` : null,
                      notStarted > 0 ? `未开始 ${notStarted}` : null,
                      overdue > 0 ? `逾期 ${overdue}` : null,
                    ]
                      .filter(Boolean)
                      .join('　')}
                  </Text>
                </View>
              ) : null}
              {tasks.length > 0 ? (
                <View
                  style={[
                    todayStyles.listHeading,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <Text className={classes.foreground} style={styles.cardTitle}>
                    今日安排
                  </Text>
                  <Text className={classes.muted} style={styles.muted}>
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
              className="border-b border-border"
              onPress={() => onOpenTask(item.id)}
              style={({ pressed }) => [
                todayStyles.taskRow,
                pressed && styles.pressedRow,
              ]}
              testID={`today-task-${item.id}`}
            >
              <View
                style={[
                  todayStyles.taskNode,
                  { borderColor: colors.border },
                  item.status === 'submitted' && {
                    backgroundColor: colors.positiveBackground,
                    borderColor: colors.successMark,
                  },
                  item.status === 'in_progress' && {
                    borderColor: colors.primary,
                    ...todayStyles.taskNodeCurrent,
                  },
                  item.status === 'overdue' && {
                    backgroundColor: colors.warningBackground,
                    borderColor: colors.warning,
                  },
                ]}
              >
                {item.status === 'submitted' ? (
                  <Check color={colors.success} size={14} />
                ) : (
                  <Text
                    className={classes.muted}
                    style={todayStyles.taskNumber}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <View style={todayStyles.taskCopy}>
                <Text className={classes.foreground} style={styles.cardTitle}>
                  {item.templateName}
                </Text>
                <Text className={classes.muted} style={styles.muted}>
                  {formatTimeWindow(item, today.timezone)}
                </Text>
              </View>
              <Text
                className={
                  item.status === 'submitted'
                    ? classes.successText
                    : item.status === 'overdue'
                      ? classes.warningTitle
                      : classes.muted
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
          className={classes.background}
          contentContainerStyle={styles.centered}
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
