import { Pressable, ScrollView, Text, View } from 'react-native';
import type { TodayResponse } from '@libs/shared';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

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
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
    >
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
      <View className={classes.empty} style={styles.empty}>
        <Text className={classes.muted} style={styles.muted}>
          今日任务暂不可用
        </Text>
      </View>
      <ErrorBanner message={todayError} />
    </ScrollView>
  );
}
