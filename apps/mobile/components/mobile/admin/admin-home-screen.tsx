import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  ClipboardCheck,
  Bell,
  SlidersHorizontal,
  Store,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ErrorBanner } from '../error-banner';
import { PrimaryButton } from '../primary-button';
import { useSession } from '../session-provider';
import { classes, styles } from '../styles';
import { useTabColors } from '../use-tab-colors';
import { useNotifications } from '../notification-provider';

const entries: {
  href: Href;
  label: string;
  icon: LucideIcon;
  testID: string;
}[] = [
  {
    href: '/admin/dashboard',
    label: '总部看板',
    icon: BarChart3,
    testID: 'admin-entry-dashboard',
  },
  {
    href: '/admin/today',
    label: '今日视图',
    icon: CalendarDays,
    testID: 'admin-entry-today',
  },
  {
    href: '/admin/review',
    label: '审核队列',
    icon: ClipboardCheck,
    testID: 'admin-entry-review',
  },
  {
    href: '/admin/accounts',
    label: '账号',
    icon: UserRound,
    testID: 'admin-entry-accounts',
  },
  {
    href: '/admin/sites',
    label: '门店',
    icon: Store,
    testID: 'admin-entry-sites',
  },
  {
    href: '/admin/templates',
    label: '模板',
    icon: ClipboardList,
    testID: 'admin-entry-templates',
  },
  {
    href: '/admin/ai-standards',
    label: 'AI 标准',
    icon: SlidersHorizontal,
    testID: 'admin-entry-ai-standards',
  },
  {
    href: '/admin/schedules',
    label: '日程',
    icon: CalendarDays,
    testID: 'admin-entry-schedules',
  },
  {
    href: '/admin/site-schedules',
    label: '门店日程安排',
    icon: CalendarRange,
    testID: 'admin-entry-site-schedules',
  },
  {
    href: '/admin/profile',
    label: '我的',
    icon: UserRound,
    testID: 'admin-entry-profile',
  },
];

export function AdminHomeScreen({ displayName }: { displayName: string }) {
  const router = useRouter();
  const tabColors = useTabColors();
  const { logout, logoutError } = useSession();
  const { unreadCount } = useNotifications();

  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
    >
      <View style={styles.adminHomeHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            accessibilityRole="header"
            className={classes.foreground}
            style={styles.heading}
          >
            管理员主页
          </Text>
          <Text className={classes.muted} style={styles.muted}>
            {displayName}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`通知${unreadCount ? `，${unreadCount} 条未读` : ''}`}
          accessibilityRole="button"
          onPress={() => router.push('/admin/notifications')}
          style={styles.adminNotificationButton}
          testID="admin-notifications"
        >
          <Bell color={tabColors.accent} size={22} />
          {unreadCount > 0 ? (
            <View
              className={classes.notificationBadge}
              style={styles.adminNotificationBadge}
            >
              <Text
                className={classes.notificationBadgeText}
                style={styles.adminNotificationBadgeText}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <View style={{ gap: 8 }}>
        {entries.map(({ href, label, icon: Icon, testID }) => (
          <Pressable
            accessibilityRole="button"
            className={classes.card}
            key={testID}
            onPress={() => router.push(href)}
            style={({ pressed }) => [
              styles.adminEntry,
              pressed && styles.pressedRow,
            ]}
            testID={testID}
          >
            <Icon color={tabColors.accent} size={20} />
            <Text className={classes.foreground} style={styles.cardTitle}>
              {label}
            </Text>
            <View style={{ flex: 1 }} />
            <ArrowRight color={tabColors.mutedForeground} size={18} />
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={logoutError} />
      <PrimaryButton onPress={logout} variant="secondary" testID="admin-logout">
        退出登录
      </PrimaryButton>
    </ScrollView>
  );
}
