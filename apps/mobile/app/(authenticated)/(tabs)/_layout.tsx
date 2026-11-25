import Tabs from 'expo-router/tabs';
import { MobileBottomBar } from '../../../components/mobile/manager-ui';
import {
  Bell,
  ClipboardCheck,
  ListChecks,
  UserRound,
} from 'lucide-react-native';
import { useTabColors } from '../../../components/mobile/use-tab-colors';
import { useNotifications } from '../../../components/mobile/notification-provider';
import { MobileTabButton } from '../../../components/mobile/mobile-tab-button';

export const unstable_settings = {
  initialRouteName: 'today',
};

export default function TabLayout() {
  const tabColors = useTabColors();
  const { unreadCount } = useNotifications();

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: tabColors.background },
          tabBarActiveTintColor: tabColors.mobilePrimary,
          tabBarInactiveTintColor: tabColors.mutedForeground,
          tabBarLabelStyle: {
            fontFamily: tabColors.mobileDisplayFont,
            fontSize: tabColors.mobileTabTextSize,
            fontWeight: '600',
          },
          tabBarButton: (props) => <MobileTabButton {...props} />,
        }}
        tabBar={(props) => <MobileBottomBar {...props} />}
      >
        <Tabs.Screen
          name="today"
          options={{
            title: '今日待巡',
            tabBarAccessibilityLabel: '今日待巡',
            tabBarIcon: ({ color, size }) => (
              <ClipboardCheck color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="records"
          options={{
            title: '记录',
            tabBarAccessibilityLabel: '记录',
            tabBarIcon: ({ color, size }) => (
              <ListChecks color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: '通知',
            tabBarAccessibilityLabel: '通知',
            tabBarBadge:
              unreadCount > 99
                ? '99+'
                : unreadCount > 0
                  ? unreadCount
                  : undefined,
            tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: '我的',
            tabBarAccessibilityLabel: '我的',
            tabBarIcon: ({ color, size }) => (
              <UserRound color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
