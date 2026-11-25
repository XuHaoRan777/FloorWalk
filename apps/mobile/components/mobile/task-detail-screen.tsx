import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InspectorTaskDetail } from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ChatPanel } from './chat-panel';
import { ErrorBanner } from './error-banner';
import {
  MobileButton,
  MobileStatusTag,
  MobileText,
  MobileTopBar,
} from './manager-ui';
import { MobileEmptyState } from './manager-data-ui';
import { TaskItemCard } from './task-item-card';
import tokens from '../../../../packages/tokens/native.json';

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
  ) {
    return { canOperate: false, label: '判定已完成' };
  }

  const startsAt = Date.parse(detail.startsAt);
  const dueAt = Date.parse(detail.dueAt);
  if (now < startsAt - hour) {
    return {
      canOperate: false,
      label: `${formatTime(startsAt - hour, detail.timezone)} 起可开始`,
    };
  }
  if (now <= dueAt) {
    return {
      canOperate: true,
      label: `截止 ${formatTime(detail.dueAt, detail.timezone)}`,
    };
  }

  if (item.result === 'rework') {
    const reworkDeadline = dueAt + hour;
    if (now <= reworkDeadline) {
      return {
        canOperate: true,
        label: `重传截止 ${formatTime(reworkDeadline, detail.timezone)}`,
      };
    }
    return { canOperate: false, label: '重传时间已截止' };
  }
  if (!item.uploadedAt) {
    return { canOperate: false, label: '已过截止时间，未上传项不可操作' };
  }
  return { canOperate: false, label: '已过截止时间，不可操作' };
}

function taskStatus(detail: InspectorTaskDetail) {
  if (detail.status === 'not_started') return 'not_started' as const;
  if (detail.status === 'submitted') return 'submitted' as const;
  if (detail.status === 'overdue') return 'overdue' as const;
  return 'in_progress' as const;
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

  if (!detail) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <MobileText size="base" tone="muted">
            {loading ? '正在加载任务详情…' : '暂时无法读取任务详情。'}
          </MobileText>
          <ErrorBanner message={error} />
          {!loading ? (
            <MobileButton onPress={() => void load()} variant="secondary">
              重新加载
            </MobileButton>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      testID="task-detail-screen"
      style={styles.screen}
      edges={['top', 'bottom']}
    >
      <MobileTopBar
        backLabel="返回上级页面"
        backText="返回今日待巡"
        onBack={onBack}
        subtitle={formatTimeWindow(detail)}
        title={detail.templateName}
        titleRole="body"
        titleSize="lg"
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.page}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.taskStatus}>
          <MobileText role="fixed" size="sm">
            任务状态
          </MobileText>
          <MobileStatusTag status={taskStatus(detail)} />
        </View>
        {loading ? (
          <MobileText size="sm" tone="muted">
            正在更新任务详情…
          </MobileText>
        ) : null}
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
                if (item.position === focusPosition) {
                  scrollRef.current?.scrollTo({
                    y: event.nativeEvent.layout.y,
                    animated: true,
                  });
                }
              }}
              timezone={detail.timezone}
              canOperate={operation.canOperate}
              operationLabel={operation.label}
              onUnauthorized={onUnauthorized}
              onUploaded={refreshAfterUpload}
            />
          );
        })}
        {detail.items.length === 0 ? (
          <MobileEmptyState
            title="当前任务没有检查项。"
            style={styles.emptyState}
          />
        ) : null}
        {detail.inspectionId ? (
          <View style={styles.chat}>
            <ChatPanel inspectionId={detail.inspectionId} canSend />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: tokens.mobile.background,
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: tokens.mobileSpace.md,
    justifyContent: 'center',
    padding: tokens.mobileSpace.lg,
  },
  page: {
    gap: tokens.mobileSpace.md,
    paddingBottom: tokens.mobileSpace.display,
    paddingHorizontal: tokens.mobileSpace.lg,
    paddingTop: tokens.mobileSpace.md,
  },
  taskStatus: {
    alignItems: 'center',
    borderBottomColor: tokens.mobile.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: tokens.mobileSpace.sm,
  },
  emptyState: {
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  chat: {
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
    marginTop: tokens.mobileSpace.md,
    paddingTop: tokens.mobileSpace.md,
  },
});
