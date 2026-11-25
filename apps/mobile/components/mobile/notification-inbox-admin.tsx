import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import type { Notification } from '@libs/shared';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

export type NotificationInboxRow =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'notification'; key: string; notification: Notification };

export function NotificationInboxAdmin({
  error,
  loading,
  loadingMore,
  notificationsLength,
  onLoadMore,
  onRefresh,
  onRetry,
  refreshing,
  rows,
  showBack,
  onBack,
  busyId,
  labels,
  describeNotification,
  onOpenNotification,
}: {
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  notificationsLength: number;
  onLoadMore: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  refreshing: boolean;
  rows: NotificationInboxRow[];
  showBack: boolean;
  onBack: () => void;
  busyId: string | null;
  labels: Record<Notification['type'], string>;
  describeNotification: (notification: Notification) => string;
  onOpenNotification: (notification: Notification) => void;
}) {
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
  );
  const renderRow = ({ item }: { item: NotificationInboxRow }) => {
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
        accessibilityLabel={`${labels[notification.type]}，${describeNotification(notification)}`}
        className="border-b border-border"
        disabled={busyId !== null}
        onPress={() => onOpenNotification(notification)}
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
          <Text className={classes.foreground} style={styles.notificationTitle}>
            {labels[notification.type]}
          </Text>
          <Text className={classes.muted} style={styles.muted}>
            {describeNotification(notification)}
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
  };

  return (
    <View className={classes.background} style={styles.notificationScreen}>
      <View style={styles.notificationHeader}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
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
      ) : notificationsLength === 0 && error ? (
        <View style={styles.notificationEmptyContent}>
          <PrimaryButton onPress={onRetry} variant="secondary">
            重试
          </PrimaryButton>
        </View>
      ) : notificationsLength === 0 ? (
        <FlatList
          accessibilityLabel="通知收件箱"
          contentContainerStyle={styles.notificationEmptyContent}
          data={[] as NotificationInboxRow[]}
          ListEmptyComponent={
            <Text className={classes.muted} style={styles.muted}>
              暂无通知
            </Text>
          }
          refreshControl={refreshControl}
          testID="notification-inbox"
        />
      ) : (
        <FlatList
          accessibilityLabel="通知收件箱"
          contentContainerStyle={styles.notificationListContent}
          contentInsetAdjustmentBehavior="automatic"
          data={rows}
          keyExtractor={(item) => item.key}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.35}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, contentSize, layoutMeasurement } =
              nativeEvent;
            const distanceFromEnd =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            if (
              layoutMeasurement.height > 0 &&
              distanceFromEnd <= layoutMeasurement.height * 0.35
            )
              onLoadMore();
          }}
          scrollEventThrottle={16}
          refreshControl={refreshControl}
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
