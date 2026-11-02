import Tabs from 'expo-router/tabs';
import { useTabColors } from '../../../components/mobile/use-tab-colors';

export default function TabLayout() {
  const tabColors = useTabColors();

  return (
    <>
      <Tabs
        initialRouteName="today"
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: tabColors.background },
          tabBarActiveTintColor: tabColors.accent,
          tabBarInactiveTintColor: tabColors.mutedForeground,
          tabBarLabelStyle: { fontSize: 14, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="today"
          options={{ title: '今日待巡', tabBarAccessibilityLabel: '今日待巡' }}
        />
        <Tabs.Screen
          name="records"
          options={{ title: '记录', tabBarAccessibilityLabel: '记录' }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: '我的', tabBarAccessibilityLabel: '我的' }}
        />
      </Tabs>
    </>
  );
}
