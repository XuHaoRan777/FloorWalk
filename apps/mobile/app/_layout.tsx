import '../global.css';
import Stack from 'expo-router/stack';
import { useFonts } from 'expo-font';
import { Text, View } from 'react-native';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import {
  SessionProvider,
  useSession,
} from '../components/mobile/session-provider';
import { classes, styles } from '../components/mobile/styles';

function Routes() {
  const { session, hydrating } = useSession();
  if (hydrating)
    return (
      <View className={classes.background} style={styles.centered}>
        <Text className={classes.muted} style={styles.description}>
          正在恢复登录状态…
        </Text>
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
      <Stack.Screen name="__design-samples" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
  });

  if (!fontsLoaded) return null;

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
