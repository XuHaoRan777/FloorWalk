import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InspectorRecordsResponse } from '@libs/shared';
import { ApiError, api, userFacingError } from '../../lib/api';
import { BrandMark } from './brand-mark';
import { ErrorBanner } from './error-banner';
import { MobileEmptyState } from './manager-data-ui';
import {
  MobileButton,
  MobileStatusTag,
  MobileText,
  MobileTopBar,
} from './manager-ui';
import tokens from '../../../../packages/tokens/native.json';

type RecordItem = InspectorRecordsResponse['items'][number];
type OpenRecord = Pick<RecordItem, 'id' | 'templateName' | 'taskDate'>;

const statusLabels: Record<RecordItem['status'], string> = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  rework: '待补交',
  failed: '未通过',
  passed: '已通过',
};

const taskStatusLabels: Record<
  NonNullable<RecordItem['taskStatus']>,
  string
> = {
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  overdue: '逾期',
};

const inspectionStatusTags = {
  draft: 'pending',
  submitted: 'submitted',
  in_review: 'in_progress',
  rework: 'rework',
  failed: 'failed',
  passed: 'completed',
} as const;

const taskStatusTags = {
  not_started: 'not_started',
  in_progress: 'in_progress',
  submitted: 'submitted',
  overdue: 'overdue',
} as const;

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

function formatTaskDate(item: RecordItem) {
  if (!item.taskDate) return formatDate(item.createdAt);
  const [, month, day] = item.taskDate.split('-');
  return `${month}月${day}日`;
}

function recordStatus(item: RecordItem) {
  if (item.taskStatus) {
    return {
      status: taskStatusTags[item.taskStatus],
    label: taskStatusLabels[item.taskStatus],
    description: `任务状态：${taskStatusLabels[item.taskStatus]}`,
    };
  }
  return {
    status: inspectionStatusTags[item.status],
    label: statusLabels[item.status],
    description: `巡检状态：${statusLabels[item.status]}`,
  };
}

export function RecordsScreen({
  siteName,
  managerName,
  onOpenRecord,
  onUnauthorized,
}: {
  siteName: string;
  managerName: string;
  onOpenRecord: (record: OpenRecord) => void;
  onUnauthorized: () => void;
}) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadFirstPage = useCallback(
    async (isRefresh = false) => {
      const version = ++requestVersion.current;
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadingMore(false);
      try {
        const page = await api.inspectorRecords();
        if (version !== requestVersion.current) return;
        setRecords(page.items);
        setNextCursor(page.nextCursor);
      } catch (cause) {
        if (version === requestVersion.current) {
          if (cause instanceof ApiError && cause.status === 401)
            onUnauthorized();
          setError(userFacingError(cause));
        }
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || refreshing || loading) return;
    const version = requestVersion.current;
    setError(null);
    setLoadingMore(true);
    try {
      const page = await api.inspectorRecords(nextCursor);
      if (version !== requestVersion.current) return;
      setRecords((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (version === requestVersion.current) {
        if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
        setError(userFacingError(cause));
      }
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, nextCursor, onUnauthorized, refreshing]);

  const emptyMessage = loading
    ? '正在加载巡检记录…'
    : error
      ? '暂时无法加载巡检记录。'
      : '暂无巡检记录。';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <MobileTopBar
        leading={<BrandMark size={30} />}
        title={siteName || 'FloorWalk'}
        titleRole="body"
        titleSize="base"
        subtitle={managerName ? `店长 ${managerName}` : '店长'}
      />
      <FlatList
        contentContainerStyle={styles.page}
        data={records}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <MobileEmptyState
            title={emptyMessage}
            action={
              error ? (
                <MobileButton
                  onPress={() => void loadFirstPage(true)}
                  variant="secondary"
                >
                  重新加载
                </MobileButton>
              ) : undefined
            }
            style={styles.emptyState}
          />
        }
        ListFooterComponent={
          records.length === 0 ? undefined : nextCursor ? (
            <View style={styles.footer}>
              {loadingMore ? (
                <ActivityIndicator accessibilityLabel="正在加载更多" />
              ) : (
                <MobileButton
                  disabled={refreshing || loading}
                  onPress={() => void loadMore()}
                  variant="secondary"
                  testID="load-more-records"
                >
                  加载更多
                </MobileButton>
              )}
            </View>
          ) : (
            <MobileText
              role="fixed"
              size="sm"
              tone="muted"
              style={styles.endLabel}
            >
              没有更多了
            </MobileText>
          )
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <MobileText
                  accessibilityRole="header"
                  role="title"
                  size="2xl"
                >
                  巡检记录
                </MobileText>
                <MobileText role="number" size="sm" tone="muted">
                  {new Intl.DateTimeFormat('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                  }).format(new Date())}
                </MobileText>
              </View>
              <Pressable
                accessibilityLabel="刷新记录"
                accessibilityRole="button"
                accessibilityState={{ disabled: refreshing }}
                disabled={refreshing}
                onPress={() => void loadFirstPage(true)}
                style={({ pressed }) => [
                  styles.refreshButton,
                  pressed && styles.pressedButton,
                ]}
                testID="refresh-records"
              >
                <RefreshCw color={tokens.mobile.primary} size={18} />
                <MobileText role="fixed" size="sm" tone="primary">
                  {refreshing ? '刷新中…' : '刷新'}
                </MobileText>
              </Pressable>
            </View>
            <View style={styles.sectionHeading}>
              <MobileText role="fixed" size="base">
                近期记录
              </MobileText>
            </View>
            <ErrorBanner message={error} />
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadFirstPage(true)}
          />
        }
        renderItem={({ item }) => {
          const status = recordStatus(item);
          return (
            <Pressable
              accessibilityLabel={`查看 ${item.templateName} 巡检记录`}
              accessibilityRole="button"
              onPress={() => onOpenRecord(item)}
              style={({ pressed }) => [
                styles.recordCard,
                pressed && styles.pressedCard,
              ]}
              testID={`record-row-${item.id}`}
            >
              <View style={styles.recordHeading}>
                <MobileText
                  size="lg"
                  numberOfLines={2}
                  style={styles.recordTitle}
                >
                  {item.templateName}
                </MobileText>
                <MobileStatusTag status={status.status} label={status.label} />
              </View>
              <View style={styles.recordDetails}>
                <MobileText role="number" size="sm" tone="muted">
                  {formatTaskDate(item)}
                </MobileText>
                <MobileText size="sm" tone="muted">
                  {status.description}
                </MobileText>
                <MobileText role="number" size="sm" tone="muted">
                  分数：{item.score === null ? '—' : `${item.score} 分`}
                </MobileText>
              </View>
              <View style={styles.recordDates}>
                <MobileText role="fixed" size="xs" tone="muted">
                  创建时间：{formatDate(item.createdAt)}
                </MobileText>
                <MobileText role="fixed" size="xs" tone="muted">
                  提交时间：{formatDate(item.submittedAt)}
                </MobileText>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: tokens.mobile.background,
    flex: 1,
  },
  page: {
    gap: tokens.mobileSpace.sm,
    paddingBottom: tokens.mobileSpace.display,
    paddingHorizontal: tokens.mobileSpace.lg,
    paddingTop: tokens.mobileSpace.lg,
  },
  listHeader: { gap: tokens.mobileSpace.md },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headingCopy: { flex: 1, gap: tokens.mobileSpace.xs, minWidth: 0 },
  refreshButton: {
    alignItems: 'center',
    borderRadius: tokens.mobileRadius.control,
    flexDirection: 'row',
    gap: tokens.mobileSpace.xs,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: tokens.mobileSpace.sm,
  },
  pressedButton: { backgroundColor: tokens.mobile.primarySoft },
  sectionHeading: {
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
    paddingTop: tokens.mobileSpace.md,
  },
  emptyState: {
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 180,
  },
  footer: { alignItems: 'center', paddingTop: tokens.mobileSpace.md },
  endLabel: { paddingVertical: tokens.mobileSpace.lg, textAlign: 'center' },
  recordCard: {
    backgroundColor: tokens.mobile.surface,
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 1,
    gap: tokens.mobileSpace.sm,
    padding: tokens.mobileSpace.md,
  },
  pressedCard: { backgroundColor: tokens.mobile.primarySoft },
  recordHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    justifyContent: 'space-between',
  },
  recordTitle: { flex: 1, minWidth: 0 },
  recordDetails: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.mobileSpace.sm,
  },
  recordDates: { gap: tokens.mobileSpace.xs },
});
