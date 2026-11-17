import Stack from 'expo-router/stack';
import { NotificationProvider } from '../../components/mobile/notification-provider';
import { TodayProvider } from '../../components/mobile/today-provider';
import { useSession } from '../../components/mobile/session-provider';
import { styles } from '../../components/mobile/styles';

export default function AuthenticatedLayout() {
  const { session } = useSession();
  const mustChangePassword = session?.user.mustChangePassword ?? false;
  const isAdmin = session?.user.role === 'admin';
  const routes = (
    <Stack screenOptions={{ headerShown: false, contentStyle: styles.app }}>
      <Stack.Protected guard={!mustChangePassword && isAdmin}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
      <Stack.Protected guard={!mustChangePassword && !isAdmin}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="inspection/[id]" />
        <Stack.Screen name="records/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={!mustChangePassword}>
        <Stack.Screen name="chat/[id]" />
      </Stack.Protected>
      <Stack.Screen name="change-password" />
    </Stack>
  );
  return (
    <NotificationProvider>
      {mustChangePassword || isAdmin ? (
        routes
      ) : (
        <TodayProvider>{routes}</TodayProvider>
      )}
    </NotificationProvider>
  );
}
