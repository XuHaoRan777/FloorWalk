import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type {
  StyleProp,
  TextInputProps,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { MobileText } from './manager-ui';
import tokens from '../../../../packages/tokens/native.json';

export function MobileTextField({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  multiline = false,
  style,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
} & Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'placeholder' | 'editable' | 'multiline' | 'style'
>) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.textField, style]}>
      <MobileText role="fixed" size="sm">
        {label}
      </MobileText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        editable={editable}
        multiline={multiline}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={tokens.mobile.disabledForeground}
        style={[
          styles.textInput,
          multiline && styles.multilineInput,
          !editable && styles.disabledInput,
          focused && styles.focusedInput,
        ]}
        value={value}
      />
    </View>
  );
}

export function MobileListRow({
  title,
  description,
  trailing,
  titleRole = 'body',
  onPress,
  style,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
  titleRole?: 'body' | 'fixed';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <>
      <View style={styles.listRowText}>
        <MobileText role={titleRole} size="base" numberOfLines={2}>
          {title}
        </MobileText>
        {description ? (
          <MobileText size="sm" tone="muted" numberOfLines={2}>
            {description}
          </MobileText>
        ) : null}
      </View>
      {trailing}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        style,
        pressed && { backgroundColor: tokens.mobile.primarySoft },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.listRow, style]}>{content}</View>
  );
}

export function MobileSurfaceCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function MobileEmptyState({
  title,
  description,
  icon,
  action,
  style,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.emptyState, style]}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <MobileText role="fixed" size="lg" style={styles.emptyTitle}>
        {title}
      </MobileText>
      {description ? (
        <MobileText size="sm" tone="muted" style={styles.emptyDescription}>
          {description}
        </MobileText>
      ) : null}
      {action}
    </View>
  );
}

const styles = {
  textField: { gap: tokens.mobileSpace.xs },
  textInput: {
    backgroundColor: tokens.mobile.surface,
    borderColor: tokens.mobile.input,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 1,
    color: tokens.mobile.foreground,
    fontSize: tokens.mobileType.base,
    minHeight: 48,
    paddingHorizontal: tokens.mobileSpace.sm,
    paddingVertical: tokens.mobileSpace.xs,
  },
  multilineInput: {
    minHeight: 88,
    paddingVertical: tokens.mobileSpace.sm,
    textAlignVertical: 'top',
  },
  disabledInput: {
    backgroundColor: tokens.mobile.disabledBackground,
    borderColor: tokens.mobile.border,
    color: tokens.mobile.disabledForeground,
  },
  focusedInput: { borderColor: tokens.mobile.primary, borderWidth: 2 },
  listRow: {
    alignItems: 'center',
    borderBottomColor: tokens.mobile.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.md,
    minHeight: 56,
    paddingVertical: tokens.mobileSpace.sm,
  },
  listRowText: { flex: 1, gap: tokens.mobileSpace.xs, minWidth: 0 },
  card: {
    backgroundColor: tokens.mobile.surface,
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.card,
    borderWidth: 1,
    boxShadow: tokens.mobileShadow.card,
    gap: tokens.mobileSpace.md,
    padding: tokens.mobileSpace.lg,
  },
  emptyState: {
    alignItems: 'center',
    gap: tokens.mobileSpace.sm,
    justifyContent: 'center',
    padding: tokens.mobileSpace.xxl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.primarySoft,
    borderRadius: tokens.mobileRadius.card,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  emptyTitle: { textAlign: 'center' },
  emptyDescription: { maxWidth: 300, textAlign: 'center' },
} satisfies Record<string, ViewStyle | TextStyle>;
