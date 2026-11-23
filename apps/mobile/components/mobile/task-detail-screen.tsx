import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import type { InspectorTaskDetail } from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';
import { ChatPanel } from './chat-panel';
import { TaskItemCard } from './task-item-card';

const hour = 60 * 60 * 1000;

function formatTime(value: string | number, timezone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function formatTimeWindow(detail: InspectorTaskDetail) {
  const endsNextDay =
    formatDate(detail.startsAt, detail.timezone) !==
    formatDate(detail.dueAt, detail.timezone);
  return `${formatTime(detail.startsAt, detail.timezone)}～${endsNextDay ? '次日 ' : ''}${formatTime(detail.dueAt, detail.timezone)}`;
}

function operationWindow(
  detail: InspectorTaskDetail,
  item: InspectorTaskDetail['items'][number],
  now: number,
) {
  if (
    detail.inspectionStatus === 'passed' ||
    detail.inspectionStatus === 'failed'
  )
    return { canOperate: false, label: '判定已完成' };

  const startsAt = Date.parse(detail.startsAt);
  const dueAt = Date.parse(detail.dueAt);
  if (now < startsAt - hour)
    return {
      canOperate: false,
      label: `${formatTime(startsAt - hour, detail.timezone)} 起可开始`,
    };
  if (now <= dueAt)
    return {
      canOperate: true,
      label: `截止 ${formatTime(detail.dueAt, detail.timezone)}`,
    };

  if (item.result === 'rework') {
    const reworkDeadline = dueAt + hour;
    if (now <= reworkDeadline)
      return {
        canOperate: true,
        label: `重传截止 ${formatTime(reworkDeadline, detail.timezone)}`,
      };
    return { canOperate: false, label: '重传时间已截止' };
  }
  if (!item.uploadedAt)
    return { canOperate: false, label: '已过截止时间，未上传项不可操作' };
  return { canOperate: false, label: '已过截止时间，不可操作' };
}

export function TaskDetailScreen({
  id,
  focusPosition,
  onBack,
  onUnauthorized,
  onTaskUpdated,
}: {
  id: string;
  focusPosition?: number;
  onBack: () => void;
  onUnauthorized: () => void;
  onTaskUpdated: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<InspectorTaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setDetail(await api.inspectorTask(id));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      setError(userFacingError(cause));
    } finally {
      setLoading(false);
    }
  }, [id, onUnauthorized]);

  const refreshAfterUpload = useCallback(async () => {
    await Promise.all([load(), onTaskUpdated()]);
  }, [load, onTaskUpdated]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!detail)
    return (
      <View className={classes.background} style={styles.centered}>
        <Text className={classes.muted} style={styles.description}>
          {loading ? '正在加载任务详情…' : '暂时无法读取任务详情。'}
        </Text>
        <ErrorBanner message={error} />
        {!loading && (
          <PrimaryButton onPress={() => void load()} variant="secondary">
            重新加载
          </PrimaryButton>
        )}
      </View>
    );

  return (
    <ScrollView
      ref={scrollRef}
      className={classes.background}
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      testID="task-detail-screen"
    >
      <Pressable
        accessibilityLabel="返回上级页面"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.touchTarget,
          pressed && styles.pressedRow,
        ]}
      >
        <Text className={classes.link} style={styles.link}>
          ‹ 返回
        </Text>
      </Pressable>
      <View>
        <Text
          accessibilityRole="header"
          className={classes.foreground}
          style={styles.heading}
        >
          {detail.templateName}
        </Text>
        <Text className={classes.muted} style={styles.muted}>
          {formatTimeWindow(detail)}
        </Text>
        <Text className={classes.muted} style={styles.muted}>
          任务状态：
          {detail.status === 'not_started'
            ? '未开始'
            : detail.status === 'in_progress'
              ? '进行中'
              : detail.status === 'submitted'
                ? '已提交'
                : '逾期'}
        </Text>
      </View>
      {loading && (
        <Text className={classes.muted} style={styles.muted}>
          正在更新任务详情…
        </Text>
      )}
      <ErrorBanner message={error} />
      {detail.items.map((item) => {
        const operation = operationWindow(detail, item, now);
        return (
          <TaskItemCard
            key={item.id}
            taskId={detail.id}
            item={item}
            focused={item.position === focusPosition}
            onLayout={(event) => {
              if (item.position === focusPosition)
                scrollRef.current?.scrollTo({
                  y: event.nativeEvent.layout.y,
                  animated: true,
                });
            }}
            timezone={detail.timezone}
            canOperate={operation.canOperate}
            operationLabel={operation.label}
            onUnauthorized={onUnauthorized}
            onUploaded={refreshAfterUpload}
          />
        );
      })}
      {detail.items.length === 0 && (
        <View className={classes.empty} style={styles.empty}>
          <Text className={classes.muted} style={styles.muted}>
            当前任务没有检查项。
          </Text>
        </View>
      )}
      {detail.inspectionId && (
        <ChatPanel inspectionId={detail.inspectionId} canSend />
      )}
    </ScrollView>
  );
}
