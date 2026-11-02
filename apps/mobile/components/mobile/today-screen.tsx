import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { TodayResponse } from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

export function TodayScreen({
  today,
  todayError,
  onRefresh,
  onOpenInspection,
  onUnauthorized,
}: {
  today: TodayResponse | null;
  todayError: string | null;
  onRefresh: () => void;
  onOpenInspection: (id: string) => void;
  onUnauthorized: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startInspection() {
    if (!today) return;
    setLoading(true);
    setError(null);
    try {
      const created = await api.createInspection(today.template.id);
      onOpenInspection(created.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setLoading(false);
    }
  }

  if (!today) {
    return (
      <View className={classes.background} style={styles.centered}>
        {todayError ? (
          <>
            <ErrorBanner message={todayError} />
            <PrimaryButton onPress={onRefresh} variant="secondary">
              重新加载今日任务
            </PrimaryButton>
          </>
        ) : (
          <Text className={classes.muted} style={styles.description}>
            正在加载今日任务…
          </Text>
        )}
        <ErrorBanner message={error} />
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
            今日待巡
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
          style={styles.touchTarget}
        >
          <Text className={classes.link} style={styles.link}>
            刷新
          </Text>
        </Pressable>
      </View>
      <View className={classes.card} style={styles.card}>
        <Text className={classes.eyebrow} style={styles.cardEyebrow}>
          检查模板
        </Text>
        <Text className={classes.foreground} style={styles.cardTitle}>
          {today.template.name}
        </Text>
        <Text className={classes.muted} style={styles.muted}>
          {today.template.items.length} 个检查项 ·{' '}
          {today.submittedToday ? '今天已提交' : '今天尚未提交'}
        </Text>
        {today.site.active ? (
          <PrimaryButton
            disabled={loading}
            onPress={() => void startInspection()}
            testID="start-inspection"
          >
            {loading ? '准备中…' : '开始巡检'}
          </PrimaryButton>
        ) : (
          <View className={classes.warning} style={styles.warning}>
            <Text className={classes.warningTitle} style={styles.warningTitle}>
              门店已停用
            </Text>
            <Text className={classes.muted} style={styles.muted}>
              当前门店停用期间不能新建巡检。
            </Text>
          </View>
        )}
      </View>
      <ErrorBanner message={todayError} />
      <ErrorBanner message={error} />
      <Text className={classes.foreground} style={styles.sectionTitle}>
        被打回的巡检
      </Text>
      {today.reworkInspections.length === 0 ? (
        <View className={classes.empty} style={styles.empty}>
          <Text className={classes.muted} style={styles.muted}>
            当前没有待补交的巡检。
          </Text>
        </View>
      ) : (
        today.reworkInspections.map((inspection) => (
          <Pressable
            accessibilityRole="button"
            className={classes.card}
            key={inspection.id}
            onPress={() => onOpenInspection(inspection.id)}
            style={({ pressed }) => [styles.card, pressed && styles.pressedRow]}
          >
            <Text className={classes.foreground} style={styles.cardTitle}>
              巡检单 {inspection.id.slice(0, 8)}
            </Text>
            <Text className={classes.muted} style={styles.muted}>
              状态：待补交
              {inspection.score === null ? '' : ` · ${inspection.score} 分`}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
