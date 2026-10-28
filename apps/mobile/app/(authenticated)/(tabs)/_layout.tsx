import Tabs from 'expo-router/tabs';
import { ErrorBanner } from '../../../components/mobile/error-banner';
import { useToday } from '../../../components/mobile/today-provider';

export default function TabLayout() {
  const { loadingError } = useToday();
  return (
    <>
      <Tabs
        initialRouteName="today"
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: '#f7f5f0' },
          tabBarActiveTintColor: '#9a3412',
          tabBarInactiveTintColor: '#78716c',
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
      {loadingError && <ErrorBanner message={loadingError} />}
    </>
  );
}
