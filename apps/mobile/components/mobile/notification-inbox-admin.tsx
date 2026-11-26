import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import type { Notification } from '@libs/shared';
import { FileText } from 'lucide-react-native';
import { ErrorBanner } from './error-banner';
import { MobileEmptyState } from './manager-data-ui';
import { MobileButton, MobileText } from './manager-ui';
import { BrandMark } from './brand-mark';
import tokens from '../../../../packages/tokens/native.json';

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
  const today = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
  const refreshControl = (
    <RefreshControl
      colors={[tokens.mobile.primary]}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
  const renderRow = ({ item }: { item: NotificationInboxRow }) => {
    if (item.kind === 'section')
      return (
        <MobileText
          accessibilityRole="header"
          role="fixed"
          size="base"
          style={{ paddingHorizontal: 16, paddingTop: 16 }}
          testID={`notification-section-${item.key}`}
        >
          {item.title}
        </MobileText>
      );

    const notification = item.notification;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${labels[notification.type]}，${describeNotification(notification)}`}
        disabled={busyId !== null}
        onPress={() => onOpenNotification(notification)}
        style={({ pressed }) => ({
          alignItems: 'flex-start',
          backgroundColor: pressed
            ? tokens.mobile.pressedBackground
            : tokens.mobile.surface,
          borderBottomColor: tokens.mobile.border,
          borderBottomWidth: 1,
          flexDirection: 'row',
          gap: 12,
          minHeight: 76,
          paddingHorizontal: 16,
          paddingVertical: 12,
        })}
        testID={`notification-${notification.id}`}
      >
        <View
          accessibilityLabel={notification.readAt ? '已读' : '未读'}
          style={{
            backgroundColor: notification.readAt
              ? tokens.mobile.disabled
              : tokens.mobile.primary,
            borderRadius: tokens.mobileRadius.pill,
            height: 8,
            marginTop: 6,
            width: 8,
          }}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <MobileText role="fixed" size="base" numberOfLines={2}>
            {labels[notification.type]}
          </MobileText>
          <MobileText size="sm" numberOfLines={3}>
            {describeNotification(notification)}
          </MobileText>
          <MobileText role="number" size="xs" tone="muted">
            {new Intl.DateTimeFormat('zh-CN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(notification.createdAt))}
          </MobileText>
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={{ backgroundColor: tokens.mobile.background, flex: 1 }}
      testID="admin-notification-screen"
    >
      <View
        style={{
          backgroundColor: tokens.mobile.surface,
          borderBottomColor: tokens.mobile.border,
          borderBottomWidth: 1,
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <View
          style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
        >
          <BrandMark size={34} />
          <MobileText role="fixed" size="sm" style={{ flex: 1 }}>
            商家巡检管理 · 管理员
          </MobileText>
          <MobileText role="number" size="xs" tone="muted">
            {today}
          </MobileText>
        </View>
        <View style={{ gap: 2 }}>
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: 8,
              minHeight: 44,
            }}
          >
            {showBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="返回"
                onPress={onBack}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed
                    ? tokens.mobile.pressedBackground
                    : 'transparent',
                  borderRadius: tokens.mobileRadius.control,
                  justifyContent: 'center',
                  minHeight: 44,
                  minWidth: 44,
                })}
              >
                <MobileText role="fixed" size="xs" tone="primary">
                  返回
                </MobileText>
              </Pressable>
            ) : null}
            <MobileText
              accessibilityRole="header"
              role="title"
              size="2xl"
            >
              通知
            </MobileText>
          </View>
          <MobileText size="sm" tone="muted">
            管理员巡检消息
          </MobileText>
        </View>
      </View>
      <ErrorBanner message={error} />
      {loading ? (
        <View
          style={{
            alignItems: 'center',
            flex: 1,
            gap: 8,
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator
            accessibilityLabel="正在加载通知"
            color={tokens.mobile.primary}
          />
          <MobileText size="sm" tone="muted">
            正在加载通知…
          </MobileText>
        </View>
      ) : notificationsLength === 0 && error ? (
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
          <MobileButton onPress={onRetry} variant="secondary">
            重试
          </MobileButton>
        </View>
      ) : notificationsLength === 0 ? (
        <FlatList
          accessibilityLabel="通知收件箱"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          data={[] as NotificationInboxRow[]}
          ListEmptyComponent={
            <MobileEmptyState
              title="暂无待处理通知"
              description="有新的巡检消息时，会显示在这里。"
              icon={<FileText color={tokens.mobile.primary} size={28} />}
              style={{ paddingHorizontal: 24 }}
            />
          }
          refreshControl={refreshControl}
          testID="notification-inbox"
        />
      ) : (
        <FlatList
          accessibilityLabel="通知收件箱"
          contentContainerStyle={{ paddingBottom: 24 }}
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
              <ActivityIndicator
                accessibilityLabel="正在加载更多通知"
                color={tokens.mobile.primary}
                style={{ paddingVertical: 16 }}
              />
            ) : undefined
          }
          testID="notification-inbox"
        />
      )}
    </View>
  );
}
