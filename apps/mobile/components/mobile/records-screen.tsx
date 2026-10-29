import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import type { InspectorRecordsResponse } from '@libs/shared';
import { ApiError, api, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { styles } from './styles';

type RecordItem = InspectorRecordsResponse['items'][number];

const statusLabels: Record<RecordItem['status'], string> = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  rework: '待补交',
  failed: '未通过',
  passed: '已通过',
};

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export function RecordsScreen({
  onOpenRecord,
  onUnauthorized,
}: {
  onOpenRecord: (id: string) => void;
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
    <FlatList
      contentContainerStyle={styles.page}
      data={records}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.empty}>
          {loading && <ActivityIndicator accessibilityLabel={emptyMessage} />}
          <Text style={styles.muted}>{emptyMessage}</Text>
          {error && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadFirstPage(true)}
              style={recordStyles.refreshButton}
            >
              <Text style={styles.link}>重新加载</Text>
            </Pressable>
          )}
        </View>
      }
      ListFooterComponent={
        records.length === 0 ? null : nextCursor ? (
          <Pressable
            accessibilityRole="button"
            disabled={loadingMore || refreshing || loading}
            onPress={() => void loadMore()}
            style={recordStyles.footerButton}
            testID="load-more-records"
          >
            {loadingMore ? (
              <ActivityIndicator accessibilityLabel="正在加载更多" />
            ) : (
              <Text style={styles.link}>加载更多</Text>
            )}
          </Pressable>
        ) : (
          <Text style={[styles.muted, recordStyles.endLabel]}>没有更多了</Text>
        )
      }
      ListHeaderComponent={
        <View>
          <View style={recordStyles.headingRow}>
            <Text accessibilityRole="header" style={styles.heading}>
              巡检记录
            </Text>
            <Pressable
              accessibilityLabel="刷新记录"
              accessibilityRole="button"
              disabled={refreshing}
              onPress={() => void loadFirstPage(true)}
              style={recordStyles.refreshButton}
              testID="refresh-records"
            >
              <Text style={styles.link}>{refreshing ? '刷新中…' : '刷新'}</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>本店全部巡检单</Text>
          <ErrorBanner message={error} />
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadFirstPage(true)}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenRecord(item.id)}
          style={styles.card}
          testID={`record-row-${item.id}`}
        >
          <View style={recordStyles.rowHeading}>
            <Text style={styles.cardTitle}>
              状态：{statusLabels[item.status]}
            </Text>
            <Text style={styles.muted}>
              分数：{item.score === null ? '—' : `${item.score} 分`}
            </Text>
          </View>
          <Text style={styles.muted}>
            创建时间：{formatDate(item.createdAt)}
          </Text>
          <Text style={styles.muted}>
            提交时间：{formatDate(item.submittedAt)}
          </Text>
        </Pressable>
      )}
    />
  );
}

const recordStyles = {
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  } as const,
  rowHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  } as const,
  refreshButton: { alignItems: 'flex-end', padding: 8 } as const,
  footerButton: {
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  } as const,
  endLabel: { paddingVertical: 18, textAlign: 'center' as const },
};
