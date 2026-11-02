import { Text } from 'react-native';
import { classes, styles } from './styles';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      className={classes.error}
      style={styles.error}
    >
      {message}
    </Text>
  );
}
