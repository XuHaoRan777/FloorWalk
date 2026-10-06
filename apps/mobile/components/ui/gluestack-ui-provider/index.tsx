import React, { useEffect } from 'react';
import { Appearance, Platform, View, ViewProps } from 'react-native';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { ToastProvider } from '@gluestack-ui/core/toast/creator';

export type ModeType = 'light' | 'dark' | 'system';

export function GluestackUIProvider({
  mode = 'system',
  ...props
}: {
  mode?: ModeType;
  children?: React.ReactNode;
  style?: ViewProps['style'];
}) {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const root = document.documentElement;
      const wasLight = root.classList.contains('light');
      const wasDark = root.classList.contains('dark');

      root.classList.toggle('light', mode === 'light');
      root.classList.toggle('dark', mode === 'dark');

      return () => {
        root.classList.toggle('light', wasLight);
        root.classList.toggle('dark', wasDark);
      };
    }

    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  return (
    <View style={[{ flex: 1, height: '100%', width: '100%' }, props.style]}>
      <OverlayProvider>
        <ToastProvider>{props.children}</ToastProvider>
      </OverlayProvider>
    </View>
  );
}
