import Stack from 'expo-router/stack';
import { TodayProvider } from '../../components/mobile/today-provider';
import { styles } from '../../components/mobile/styles';

export const unstable_settings = { anchor: '(tabs)' };
export default function AuthenticatedLayout() {
  return (
    <TodayProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: styles.app }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="inspection/[id]" />
      </Stack>
    </TodayProvider>
  );
}
