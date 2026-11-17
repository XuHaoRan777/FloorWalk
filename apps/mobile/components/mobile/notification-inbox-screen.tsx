import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import type { Notification, User } from '@libs/shared';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import {
  getNotifications,
  markNotificationRead,
  type NotificationsPage,
} from '../../lib/api/notifications';
import { userFacingError } from '../../lib/api';
import { useNotifications } from './notification-provider';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

const labels: Record<Notification['type'], string> = {
  item_rework: '检查项被打回',
  inspection_decided: '巡检已判定',
  inspection_overridden: '巡检结论已改判',
  critical_item_failed: '严重项不合格',
  task_overdue: '巡检任务逾期',
  manual_review_needed: '有检查项待人工审核',
  chat_message: '巡检有新消息',
};
const endReachedThreshold = 0.35;

function describe(notification: Notification) {
  if (notification.type === 'item_rework')
    return `${notification.payload.position}. ${notification.payload.reason}`;
  if (notification.type === 'inspection_decided')
    return `${notification.payload.status === 'passed' ? '通过' : '不合格'} · ${notification.payload.score} 分`;
  if ('position' in notification.payload)
    return `第 ${notification.payload.position} 项`;
  return notification.type === 'task_overdue'
    ? '请查看逾期任务'
    : '打开巡检聊天';
}

type Row =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'notification'; key: string; notification: Notification };

function createRows(notifications: Notification[]): Row[] {
  const unread = notifications.filter((item) => !item.readAt);
  const read = notifications.filter((item) => item.readAt);
  return [
    ...(unread.length
      ? [
          { kind: 'section' as const, key: 'unread', title: '未读' },
          ...unread.map((notification) => ({
            kind: 'notification' as const,
            key: notification.id,
            notification,
          })),
        ]
      : []),
    ...(read.length
      ? [
          { kind: 'section' as const, key: 'read', title: '已读' },
          ...read.map((notification) => ({
            kind: 'notification' as const,
            key: notification.id,
            notification,
          })),
        ]
      : []),
  ];
}

function notificationTarget(notification: Notification, role: User['role']) {
  if (notification.type === 'chat_message')
    return `/chat/${notification.payload.inspectionId}` as const;
  if (role === 'admin')
    return notification.type === 'task_overdue'
      ? ('/admin/review' as const)
      : (`/admin/review/${notification.payload.taskId}` as const);
  if (
    notification.type === 'item_rework' ||
    notification.type === 'inspection_overridden'
  )
    return `/inspection/${notification.payload.taskId}?position=${notification.payload.position}` as const;
  return `/inspection/${notification.payload.taskId}` as const;
}

export function NotificationInboxScreen({
  role,
  showBack = false,
}: {
  role: User['role'];
  showBack?: boolean;
}) {
  const router = useRouter();
  const { refreshUnreadCount, markReadLocally } = useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const pageGeneration = useRef(0);

  const acceptPage = useCallback((page: NotificationsPage, append: boolean) => {
    setNotifications((current) => {
      if (!append) return page.notifications;
      const ids = new Set(current.map((item) => item.id));
      return [
        ...current,
        ...page.notifications.filter((item) => !ids.has(item.id)),
      ];
    });
    setNextCursor(page.nextCursor);
  }, []);

  const refresh = useCallback(
    async (syncCount = false) => {
      const generation = ++pageGeneration.current;
      loadingMoreRef.current = true;
      setLoadingMore(false);
      setRefreshing(true);
      setError(null);
      try {
        const page = await getNotifications();
        if (generation !== pageGeneration.current) return;
        acceptPage(page, false);
        if (syncCount) await refreshUnreadCount();
      } catch (cause) {
        if (generation === pageGeneration.current)
          setError(userFacingError(cause));
      } finally {
        if (generation === pageGeneration.current) {
          loadingMoreRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [acceptPage, refreshUnreadCount],
  );

  useEffect(() => {
    void refresh();
    return () => {
      pageGeneration.current += 1;
    };
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current || refreshing) return;
    const generation = pageGeneration.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await getNotifications(nextCursor);
      if (generation === pageGeneration.current) acceptPage(page, true);
    } catch (cause) {
      if (generation === pageGeneration.current)
        setError(userFacingError(cause));
    } finally {
      if (generation === pageGeneration.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [acceptPage, nextCursor, refreshing]);

  const rows = useMemo(() => createRows(notifications), [notifications]);

  const openNotification = useCallback(
    async (notification: Notification) => {
      if (busyId) return;
      setBusyId(notification.id);
      setError(null);
      try {
        const wasUnread = !notification.readAt;
        if (wasUnread) {
          await markNotificationRead(notification.id);
          markReadLocally(true);
          setNotifications((current) =>
            current.map((item) =>
              item.id === notification.id
                ? { ...item, readAt: new Date().toISOString() }
                : item,
            ),
          );
        }
        router.push(notificationTarget(notification, role));
      } catch (cause) {
        setError(userFacingError(cause));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, markReadLocally, role, router],
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'section')
        return (
          <Text
            accessibilityRole="header"
            className={classes.foreground}
            style={styles.sectionTitle}
            testID={`notification-section-${item.key}`}
          >
            {item.title}
          </Text>
        );
      const notification = item.notification;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${labels[notification.type]}，${describe(notification)}`}
          className="border-b border-border"
          disabled={busyId !== null}
          onPress={() => void openNotification(notification)}
          style={({ pressed }) => [
            styles.notificationRow,
            pressed && styles.pressedRow,
          ]}
          testID={`notification-${notification.id}`}
        >
          <View
            accessibilityLabel={notification.readAt ? '已读' : '未读'}
            className={
              notification.readAt
                ? classes.notificationReadDot
                : classes.notificationUnreadDot
            }
            style={styles.notificationDot}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              className={classes.foreground}
              style={styles.notificationTitle}
            >
              {labels[notification.type]}
            </Text>
            <Text className={classes.muted} style={styles.muted}>
              {describe(notification)}
            </Text>
            <Text className={classes.muted} style={styles.notificationTime}>
              {new Intl.DateTimeFormat('zh-CN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(notification.createdAt))}
            </Text>
          </View>
        </Pressable>
      );
    },
    [busyId, openNotification],
  );

  return (
    <View className={classes.background} style={styles.notificationScreen}>
      <View style={styles.notificationHeader}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/admin')
            }
            style={styles.touchTarget}
          >
            <Text className={classes.link} style={styles.link}>
              返回
            </Text>
          </Pressable>
        ) : null}
        <Text
          accessibilityRole="header"
          className={classes.foreground}
          style={styles.heading}
        >
          通知
        </Text>
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <View style={styles.notificationLoading}>
          <ActivityIndicator accessibilityLabel="正在加载通知" />
          <Text className={classes.muted} style={styles.muted}>
            正在加载通知…
          </Text>
        </View>
      ) : notifications.length === 0 && error ? (
        <View style={styles.notificationEmptyContent}>
          <PrimaryButton onPress={() => void refresh()} variant="secondary">
            重试
          </PrimaryButton>
        </View>
      ) : notifications.length === 0 ? (
        <FlatList
          accessibilityLabel="通知收件箱"
          contentContainerStyle={styles.notificationEmptyContent}
          data={[] as Row[]}
          ListEmptyComponent={
            <Text className={classes.muted} style={styles.muted}>
              暂无通知
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh(true)}
            />
          }
          testID="notification-inbox"
        />
      ) : (
        <FlatList
          accessibilityLabel="通知收件箱"
          contentContainerStyle={styles.notificationListContent}
          contentInsetAdjustmentBehavior="automatic"
          data={rows}
          keyExtractor={(item) => item.key}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={endReachedThreshold}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, contentSize, layoutMeasurement } =
              nativeEvent;
            const distanceFromEnd =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            if (
              layoutMeasurement.height > 0 &&
              distanceFromEnd <= layoutMeasurement.height * endReachedThreshold
            )
              void loadMore();
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh(true)}
            />
          }
          renderItem={renderRow}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator accessibilityLabel="正在加载更多通知" />
            ) : undefined
          }
          testID="notification-inbox"
        />
      )}
    </View>
  );
}
