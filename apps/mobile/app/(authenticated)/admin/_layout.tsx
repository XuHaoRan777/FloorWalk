import Tabs from 'expo-router/tabs';
import { useSegments } from 'expo-router';
import {
  CalendarDays,
  ClipboardCheck,
  LayoutGrid,
  UserRound,
} from 'lucide-react-native';
import { useTabColors } from '../../../components/mobile/use-tab-colors';
import { MobileTabButton } from '../../../components/mobile/mobile-tab-button';

export default function AdminLayout() {
  const colors = useTabColors();
  const segments: string[] = useSegments();
  const isReviewDetail =
    segments.includes('review') && segments.includes('[id]');

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => <MobileTabButton {...props} />,
        tabBarStyle: isReviewDetail ? { display: 'none' } : undefined,
      }}
    >
      <Tabs.Screen
        name="(today)"
        options={{
          title: '今日',
          tabBarAccessibilityLabel: '今日视图',
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: '审核',
          tabBarAccessibilityLabel: '审核队列',
          tabBarIcon: ({ color, size }) => (
            <ClipboardCheck color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="(management)"
        options={{
          title: '管理',
          tabBarAccessibilityLabel: '管理配置',
          tabBarIcon: ({ color, size }) => (
            <LayoutGrid color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarAccessibilityLabel: '个人资料',
          tabBarIcon: ({ color, size }) => (
            <UserRound color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
