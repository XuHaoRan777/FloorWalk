import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { classes, styles } from './styles';
import { useTabColors } from './use-tab-colors';

export function PrimaryButton({
  children,
  onPress,
  disabled = false,
  variant = 'primary',
  testID,
  pressFeedback = 'scale',
  focusRing = false,
  loading = false,
  style,
  accessibilityHint,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  testID?: string;
  pressFeedback?: 'scale' | 'surface';
  focusRing?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const colors = useTabColors();
  const overlayOpacity = useSharedValue(0);
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.get(),
  }));
  const mobileSurface = pressFeedback === 'surface';
  const unavailable = disabled && !loading;
  const inactive = disabled || loading;
  const backgroundColor = unavailable
    ? colors.mobileDisabledBackground
    : variant === 'secondary'
      ? colors.mobileSurface
      : variant === 'danger'
        ? colors.mobileDanger
        : colors.primary;
  const textColor = unavailable
    ? colors.mobileDisabledForeground
    : variant === 'secondary'
      ? colors.mobileForeground
      : colors.mobileSurface;

  function setPressed(pressed: boolean) {
    const target = pressed ? (variant === 'secondary' ? 1 : 0.12) : 0;
    overlayOpacity.set(
      reduceMotion
        ? target
        : withTiming(target, {
            duration: 120,
            easing: Easing.bezier(0.2, 0, 0, 1),
            reduceMotion: ReduceMotion.System,
          }),
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      className={`${
        unavailable || variant === 'secondary'
          ? classes.secondaryButton
          : variant === 'danger'
            ? classes.dangerButton
            : classes.primaryButton
      } ${!mobileSurface && !inactive && !reduceMotion ? classes.pressMotion : ''}`}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={mobileSurface ? () => setPressed(true) : undefined}
      onPressOut={mobileSurface ? () => setPressed(false) : undefined}
      pressRetentionOffset={{ top: 8, right: 8, bottom: 8, left: 8 }}
      testID={testID}
      style={[
        styles.button,
        style,
        mobileSurface && {
          backgroundColor,
          borderColor: colors.mobileBorder,
          borderWidth: !unavailable && variant === 'secondary' ? 1 : 0,
          overflow: 'hidden',
        },
      ]}
    >
      {mobileSurface && !inactive ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                variant === 'secondary'
                  ? colors.mobilePressedBackground
                  : colors.mobileForeground,
            },
            overlayStyle,
          ]}
        />
      ) : null}
      {(mobileSurface || focusRing) && focused && !inactive ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            bottom: 2,
            left: 2,
            borderWidth: 2,
            borderRadius: 8,
            borderColor:
              variant === 'secondary' ? colors.primary : colors.mobileSurface,
          }}
        />
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
        <Text
          className={
            unavailable
              ? classes.muted
              : variant === 'secondary'
                ? classes.secondaryButtonText
                : classes.primaryButtonText
          }
          style={[styles.buttonText, mobileSurface && { color: textColor }]}
        >
          {children}
        </Text>
      </View>
    </Pressable>
  );
}
