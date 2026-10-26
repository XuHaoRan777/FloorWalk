import '../global.css';
import Stack from 'expo-router/stack';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import {
  SessionProvider,
  useSession,
} from '../components/mobile/session-provider';
import { styles } from '../components/mobile/styles';

function Routes() {
  const { session, hydrating } = useSession();
  if (hydrating)
    return (
      <View style={styles.centered}>
        <Text style={styles.description}>正在恢复登录状态…</Text>
      </View>
    );
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: styles.app }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(authenticated)" />
      </Stack.Protected>
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GluestackUIProvider mode="light">
        <SessionProvider>
          <Routes />
        </SessionProvider>
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
}
