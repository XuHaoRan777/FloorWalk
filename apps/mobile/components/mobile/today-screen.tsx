import { FlatList, Pressable, Text, View } from 'react-native';
import type { InspectorTodayTask, TodayResponse } from '@libs/shared';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

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
  onRefresh,
}: {
  today: TodayResponse | null;
  todayError: string | null;
  onRefresh: () => void;
}) {
  if (!today) {
    return (
      <View className={classes.background} style={styles.centered}>
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
      </View>
    );
  }

  return (
    <FlatList
      className={classes.background}
      contentContainerStyle={styles.page}
      data={today.tasks}
      keyExtractor={(task) => task.id}
      ListEmptyComponent={
        <View className={classes.empty} style={styles.empty}>
          <Text className={classes.muted} style={styles.muted}>
            今天没有巡检任务。
          </Text>
        </View>
      }
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View style={styles.headerRow}>
            <View>
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
              hitSlop={{ top: 0, bottom: 0, left: 2, right: 2 }}
              onPress={onRefresh}
              style={({ pressed }) => [
                styles.touchTarget,
                pressed && styles.pressedRow,
              ]}
            >
              <Text className={classes.link} style={styles.link}>
                刷新
              </Text>
            </Pressable>
          </View>
          <ErrorBanner message={todayError} />
        </View>
      }
      renderItem={({ item }) => (
        <View
          className={classes.card}
          key={item.id}
          style={styles.card}
          testID={`today-task-${item.id}`}
        >
          <Text className={classes.foreground} style={styles.cardTitle}>
            {item.templateName}
          </Text>
          <Text className={classes.muted} style={styles.muted}>
            {formatTimeWindow(item, today.timezone)}
          </Text>
          <Text className={classes.muted} style={styles.muted}>
            状态：{statusLabels[item.status]}
          </Text>
        </View>
      )}
    />
  );
}
