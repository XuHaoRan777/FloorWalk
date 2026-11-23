import Tabs from 'expo-router/tabs';
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  LayoutGrid,
  UserRound,
} from 'lucide-react-native';
import { useTabColors } from '../../../components/mobile/use-tab-colors';

export default function AdminLayout() {
  const colors = useTabColors();

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarHideOnKeyboard: true,
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
          title: '看板',
          tabBarAccessibilityLabel: '总部看板',
          tabBarIcon: ({ color, size }) => (
            <BarChart3 color={color} size={size} />
          ),
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
