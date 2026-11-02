import { Pressable, Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { classes, styles } from './styles';

export function PrimaryButton({
  children,
  onPress,
  disabled = false,
  variant = 'primary',
  testID,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  testID?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      className={`${
        variant === 'secondary'
          ? classes.secondaryButton
          : variant === 'danger'
            ? classes.dangerButton
            : classes.primaryButton
      } ${!reduceMotion ? classes.pressMotion : ''}`}
      onPress={onPress}
      pressRetentionOffset={{ top: 8, right: 8, bottom: 8, left: 8 }}
      testID={testID}
      style={[styles.button, disabled && styles.disabledButton]}
    >
      <Text
        className={
          variant === 'secondary'
            ? classes.secondaryButtonText
            : classes.primaryButtonText
        }
        style={[styles.buttonText]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
