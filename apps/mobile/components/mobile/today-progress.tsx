import { Text, View } from 'react-native';
import type { InspectorTodayTask } from '@libs/shared';
import { classes } from './styles';
import { todayStyles } from './today-screen.styles';
import { useTabColors } from './use-tab-colors';

export function TodayProgress({ tasks }: { tasks: InspectorTodayTask[] }) {
  const colors = useTabColors();
  const completed = tasks.filter((task) => task.status === 'submitted').length;
  const inProgress = tasks.filter(
    (task) => task.status === 'in_progress',
  ).length;
  const overdue = tasks.filter((task) => task.status === 'overdue').length;
  const notStarted = tasks.filter(
    (task) => task.status === 'not_started',
  ).length;

  return (
    <View
      accessibilityLabel={`今日任务已完成 ${completed} 项，进行中 ${inProgress} 项，逾期 ${overdue} 项，未开始 ${notStarted} 项`}
      style={todayStyles.progress}
      testID="today-progress"
    >
      <View style={todayStyles.progressHeading}>
        <Text
          className={classes.mobileForeground}
          style={todayStyles.cardTitle}
        >
          今日进度
        </Text>
        <Text className={classes.mobileMuted} style={todayStyles.progressCount}>
          {completed} / {tasks.length} 已完成
        </Text>
      </View>
      <View accessibilityElementsHidden style={todayStyles.progressTrack}>
        {tasks.map((task) => (
          <View
            key={task.id}
            style={[
              todayStyles.progressSegment,
              {
                backgroundColor:
                  task.status === 'submitted'
                    ? colors.mobileSuccess
                    : task.status === 'in_progress'
                      ? colors.mobileRoute
                      : task.status === 'overdue'
                        ? colors.mobileWarning
                        : colors.mobileBorder,
              },
            ]}
          />
        ))}
      </View>
      <Text className={classes.mobileMuted} style={todayStyles.progressLegend}>
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
  );
}
