import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { TodayResponse } from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import type { Session } from './session';
import { styles } from './styles';

export function TodayScreen({
  session,
  today,
  onRefresh,
  onOpenInspection,
  onUnauthorized,
}: {
  session: Session;
  today: TodayResponse | null;
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
      const created = await api.createInspection(
        session.token,
        today.template.id,
      );
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
      <View style={styles.centered}>
        <Text style={styles.description}>正在加载今日任务…</Text>
        <ErrorBanner message={error} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>今日待巡</Text>
          <Text accessibilityRole="header" style={styles.heading}>
            {today.site.name}
          </Text>
        </View>
        <Pressable accessibilityLabel="刷新今日任务" onPress={onRefresh}>
          <Text style={styles.link}>刷新</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>检查模板</Text>
        <Text style={styles.cardTitle}>{today.template.name}</Text>
        <Text style={styles.muted}>
          {today.template.items.length} 个检查项 ·{' '}
          {today.submittedToday ? '今天已提交' : '今天尚未提交'}
        </Text>
        <PrimaryButton
          disabled={loading}
          onPress={() => void startInspection()}
          testID="start-inspection"
        >
          {loading ? '准备中…' : '开始巡检'}
        </PrimaryButton>
      </View>
      <ErrorBanner message={error} />
      <Text style={styles.sectionTitle}>被打回的巡检</Text>
      {today.reworkInspections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.muted}>当前没有待补交的巡检。</Text>
        </View>
      ) : (
        today.reworkInspections.map((inspection) => (
          <Pressable
            accessibilityRole="button"
            key={inspection.id}
            onPress={() => onOpenInspection(inspection.id)}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>
              巡检单 {inspection.id.slice(0, 8)}
            </Text>
            <Text style={styles.muted}>
              状态：待补交
              {inspection.score === null ? '' : ` · ${inspection.score} 分`}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
