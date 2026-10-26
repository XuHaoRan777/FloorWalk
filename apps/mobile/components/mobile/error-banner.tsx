import { Text } from 'react-native';
import { styles } from './styles';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={styles.error}>
      {message}
    </Text>
  );
}
