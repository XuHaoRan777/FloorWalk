import { useNativeVariable } from 'react-native-css/native';

export function useTabColors() {
  return {
    accent: useNativeVariable('--fw-accent'),
    mutedForeground: useNativeVariable('--fw-muted-foreground'),
    background: useNativeVariable('--fw-background'),
  };
}
