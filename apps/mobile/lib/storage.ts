import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'floorwalk.auth.token';

export async function clearLegacyAuthToken() {
  globalThis.localStorage?.removeItem(TOKEN_KEY);
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(TOKEN_KEY);
}
