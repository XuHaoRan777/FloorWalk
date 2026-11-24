import { Host, Picker, Switch, TextInput, useNativeState } from '@expo/ui';
import { useState } from 'react';
import { Text, View, type KeyboardTypeOptions } from 'react-native';
import tokens from '../../../../../packages/tokens/native.json';
import { classes, styles } from '../styles';
import { useTabColors } from '../use-tab-colors';
export function AdminField({
  label,
  value,
  onChangeText,
  disabled = false,
  password = false,
  multiline = false,
  keyboardType = 'default',
  maxLength,
  visual = 'shared',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  disabled?: boolean;
  password?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  visual?: 'shared' | 'route';
}) {
  const state = useNativeState(value);
  const colors = useTabColors();
  const [focused, setFocused] = useState(false);
  // Fields mount with their draft. Native edits update this shared state;
  // writing React's delayed change events back can overwrite newer keystrokes.
  return (
    <View style={{ gap: tokens.space.xs }}>
      <Text className={classes.muted} style={styles.label}>
        {label}
      </Text>
      <Host
        matchContents={{ vertical: true }}
        colorScheme="light"
        seedColor={colors.accent}
        style={{ width: '100%' }}
      >
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={password}
          cursorColor={visual === 'route' ? colors.primary : undefined}
          style={{
            width: '100%',
            height: multiline ? 112 : 48,
            borderRadius: tokens.radius.control,
            borderWidth: visual === 'route' && focused ? 2 : 1,
            ...(visual === 'route'
              ? {
                  borderColor: focused ? colors.primary : colors.mobileBorder,
                  backgroundColor: disabled
                    ? colors.mobileDisabledBackground
                    : colors.mobileSurface,
                }
              : {}),
            padding: tokens.space.sm,
          }}
          textStyle={{ fontSize: 16, fontFamily: tokens.font.sans.regular }}
          value={state}
        />
      </Host>
    </View>
  );
}

export function AdminSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const colors = useTabColors();
  return (
    <View style={{ gap: tokens.space.xs }}>
      <Text className={classes.muted} style={styles.label}>
        {label}
      </Text>
      <Host
        matchContents={{ vertical: true }}
        colorScheme="light"
        seedColor={colors.accent}
        style={{ width: '100%', minHeight: 48 }}
      >
        <Picker
          accessibilityLabel={label}
          enabled={!disabled}
          selectedValue={value}
          onValueChange={onChange}
        >
          <Picker.Item label="请选择" value="" />
          {options.map((option) => (
            <Picker.Item key={option.value} {...option} />
          ))}
        </Picker>
      </Host>
    </View>
  );
}

export function AdminToggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useTabColors();
  return (
    <Host
      matchContents
      colorScheme="light"
      seedColor={colors.accent}
      style={{ minHeight: 48 }}
    >
      <Switch
        label={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
    </Host>
  );
}
