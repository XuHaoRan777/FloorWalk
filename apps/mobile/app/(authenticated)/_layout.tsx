import Stack from 'expo-router/stack';
import { TodayProvider } from '../../components/mobile/today-provider';
import { useSession } from '../../components/mobile/session-provider';
import { styles } from '../../components/mobile/styles';

export const unstable_settings = { anchor: '(tabs)' };
export default function AuthenticatedLayout() {
  const { session } = useSession();
  const mustChangePassword = session?.user.mustChangePassword ?? false;
  const routes = (
    <Stack screenOptions={{ headerShown: false, contentStyle: styles.app }}>
      <Stack.Protected guard={!mustChangePassword}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="inspection/[id]" />
        <Stack.Screen name="records/[id]" />
      </Stack.Protected>
      <Stack.Screen name="change-password" />
    </Stack>
  );
  return mustChangePassword ? routes : <TodayProvider>{routes}</TodayProvider>;
}
