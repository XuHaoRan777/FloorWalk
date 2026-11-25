import { useState, type ComponentProps } from 'react';
import { PlatformPressable } from 'expo-router/react-navigation';
import { View } from 'react-native';
import { useTabColors } from './use-tab-colors';

export function MobileTabButton({
  children,
  onFocus,
  onBlur,
  style,
  ...props
}: ComponentProps<typeof PlatformPressable>) {
  const colors = useTabColors();
  const [focused, setFocused] = useState(false);

  return (
    <PlatformPressable
      {...props}
      pressColor={colors.mobilePressedBackground}
      style={[
        style,
        {
          borderRadius: 10,
          minHeight: 44,
          minWidth: 44,
          overflow: 'hidden',
        },
      ]}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
    >
      {children}
      {focused && !props.disabled ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            bottom: 2,
            left: 2,
            borderWidth: 2,
            borderRadius: 10,
            borderColor: colors.mobilePrimary,
          }}
        />
      ) : null}
    </PlatformPressable>
  );
}
