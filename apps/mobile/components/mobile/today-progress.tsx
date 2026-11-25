import type { InspectorTodayTask } from '@libs/shared';
import { View } from 'react-native';
import { MobileStatusTag, MobileText } from './manager-ui';
import tokens from '../../../../packages/tokens/native.json';
import { todayStyles } from './today-screen.styles';

export function TodayProgress({ tasks }: { tasks: InspectorTodayTask[] }) {
  const completed = tasks.filter((task) => task.status === 'submitted').length;
  const inProgress = tasks.filter(
    (task) => task.status === 'in_progress',
  ).length;
  const overdue = tasks.filter((task) => task.status === 'overdue').length;
  const notStarted = tasks.filter(
    (task) => task.status === 'not_started',
  ).length;
  const summary = [
    ['completed', '已完成', completed, tokens.mobile.success],
    ['in_progress', '进行中', inProgress, tokens.mobile.primary],
    ['overdue', '逾期', overdue, tokens.mobile.danger],
    ['not_started', '未开始', notStarted, tokens.mobile.disabled],
  ] as const;

  return (
    <View
      accessibilityLabel={`今日任务已完成 ${completed} 项，进行中 ${inProgress} 项，逾期 ${overdue} 项，未开始 ${notStarted} 项`}
      style={todayStyles.progress}
      testID="today-progress"
    >
      <View style={todayStyles.progressHeading}>
        <MobileText role="fixed" size="base">
          今日进度
        </MobileText>
        <MobileText role="number" size="lg">
          {completed} / {tasks.length}
        </MobileText>
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
                    ? tokens.mobile.success
                    : task.status === 'in_progress'
                      ? tokens.mobile.primary
                      : task.status === 'overdue'
                        ? tokens.mobile.danger
                        : tokens.mobile.disabled,
              },
            ]}
          />
        ))}
      </View>
      <View style={todayStyles.progressSummary}>
        {summary.map(([status, label, count, color]) => (
          <MobileStatusTag
            key={status}
            status={status}
            label={`${label} ${count}`}
            style={{ borderColor: color, borderWidth: 1 }}
          />
        ))}
      </View>
    </View>
  );
}
