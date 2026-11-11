import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { InspectionDetail } from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';
import { ChatPanel } from './chat-panel';

export function InspectionScreen({
  id,
  onBack,
  onUnauthorized,
}: {
  id: string;
  onBack: () => void;
  onUnauthorized: () => void;
}) {
  const [detail, setDetail] = useState<InspectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.inspection(id));
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      setError(userFacingError(cause));
    }
  }, [id, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!detail)
    return (
      <View className={classes.background} style={styles.centered}>
        <Text className={classes.muted} style={styles.description}>
          正在加载巡检单…
        </Text>
        <ErrorBanner message={error} />
        {error && (
          <PrimaryButton onPress={() => void load()} variant="secondary">
            重新加载
          </PrimaryButton>
        )}
      </View>
    );

  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
    >
      <Pressable
        accessibilityLabel="返回任务"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.touchTarget,
          pressed && styles.pressedRow,
        ]}
      >
        <Text className={classes.link} style={styles.link}>
          ‹ 返回任务
        </Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.heading}
      >
        巡检详情
      </Text>
      {detail.items.map((item) => (
        <View
          key={item.id}
          className={classes.card}
          style={styles.card}
          testID={`inspection-item-${item.position}`}
        >
          <Text className={classes.foreground} style={styles.cardTitle}>
            {item.position}. {item.title}
          </Text>
          {item.acceptanceCriteria && (
            <Text className={classes.muted} style={styles.muted}>
              验收要点：{item.acceptanceCriteria}
            </Text>
          )}
          <Text className={classes.muted} style={styles.muted}>
            结果：
            {item.result === 'pending'
              ? '待判定'
              : item.result === 'pass'
                ? '通过'
                : item.result === 'rework'
                  ? '打回'
                  : '不合格'}
          </Text>
          {item.note && (
            <Text className={classes.muted} style={styles.muted}>
              备注：{item.note}
            </Text>
          )}
          <Text className={classes.muted} style={styles.muted}>
            已上传 {item.evidence.length} 张照片
          </Text>
        </View>
      ))}
      {detail.items.length === 0 && (
        <View className={classes.empty} style={styles.empty}>
          <Text className={classes.muted} style={styles.muted}>
            当前巡检单没有检查项。
          </Text>
        </View>
      )}
      <ErrorBanner message={error} />
      <ChatPanel inspectionId={detail.id} canSend />
    </ScrollView>
  );
}
