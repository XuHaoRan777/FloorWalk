import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  Check,
  Clock3,
  CornerUpLeft,
  X,
} from 'lucide-react-native';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/tabs';
import tokens from '../../../../packages/tokens/native.json';

export type MobileTextRole = 'body' | 'fixed' | 'title' | 'number';
export type MobileTextSize = keyof typeof tokens.mobileType;
export type MobileTextTone =
  | 'foreground'
  | 'muted'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'change'
  | 'disabled';

const toneColors: Record<MobileTextTone, string> = {
  foreground: tokens.mobile.foreground,
  muted: tokens.mobile.mutedForeground,
  primary: tokens.mobile.primaryText,
  success: tokens.mobile.successText,
  warning: tokens.mobile.warningText,
  danger: tokens.mobile.dangerText,
  change: tokens.mobile.changeText,
  disabled: tokens.mobile.disabledForeground,
};

export function MobileText({
  children,
  role = 'body',
  size = 'base',
  tone = 'foreground',
  style,
  ...props
}: {
  children: ReactNode;
  role?: MobileTextRole;
  size?: MobileTextSize;
  tone?: MobileTextTone;
  style?: StyleProp<TextStyle>;
} & Omit<
  React.ComponentProps<typeof Text>,
  'children' | 'style' | 'role'
>) {
  return (
    <Text
      {...props}
      style={[
        {
          color: toneColors[tone],
          fontFamily:
            role === 'body' ? undefined : tokens.mobileFont.display.regular,
          fontSize: tokens.mobileType[size],
          lineHeight: Math.round(
            tokens.mobileType[size] * (role === 'title' ? 1.25 : 1.5),
          ),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function MobileTopBar({
  title,
  subtitle,
  leading,
  trailing,
  onBack,
  titleRole = 'title',
  titleSize = 'xl',
  backLabel = '返回上级页面',
  backText = '返回',
  style,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onBack?: () => void;
  titleRole?: MobileTextRole;
  titleSize?: MobileTextSize;
  backLabel?: string;
  backText?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.topBar, style]}>
      {onBack ? (
        <Pressable
          accessibilityLabel={backLabel}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { backgroundColor: tokens.mobile.primarySoft },
          ]}
        >
          <MobileText role="fixed" size="sm" tone="primary">
            {backText}
          </MobileText>
        </Pressable>
      ) : null}
      {leading}
      <View style={styles.topBarHeading}>
        <MobileText
          accessibilityRole="header"
          role={titleRole}
          size={titleSize}
          numberOfLines={2}
        >
          {title}
        </MobileText>
        {subtitle ? (
          <MobileText size="sm" tone="muted" numberOfLines={2}>
            {subtitle}
          </MobileText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function MobileBottomBar(props: BottomTabBarProps) {
  return (
    <BottomTabBar
      {...props}
      style={[
        styles.bottomBar,
        { paddingBottom: Math.max(props.insets.bottom, tokens.mobileSpace.sm) },
      ]}
    />
  );
}

export function MobileButton({
  children,
  variant = 'primary',
  disabled = false,
  loading = false,
  onPress,
  style,
  testID,
  accessibilityHint,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const unavailable = disabled && !loading;
  const backgroundColor = unavailable
    ? tokens.mobile.disabledBackground
    : variant === 'secondary'
      ? tokens.mobile.surface
      : variant === 'danger'
        ? tokens.mobile.danger
        : tokens.mobile.primary;
  const foregroundColor =
    unavailable || variant === 'secondary'
      ? tokens.mobile.foreground
      : tokens.mobile.surface;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor:
            pressed && variant === 'primary'
              ? tokens.mobile.primaryPressed
              : pressed && variant === 'secondary'
                ? tokens.mobile.primarySoft
                : backgroundColor,
          borderColor:
            variant === 'secondary' || unavailable
              ? tokens.mobile.border
              : backgroundColor,
          borderWidth: variant === 'secondary' || unavailable ? 1 : 0,
        },
        style,
        focused &&
          !unavailable && {
            borderColor: tokens.mobile.primary,
            borderWidth: 2,
          },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          accessibilityLabel="正在处理"
          color={foregroundColor}
          size="small"
        />
      ) : null}
      <MobileText
        role="fixed"
        size="sm"
        tone={unavailable ? 'disabled' : 'foreground'}
        style={
          variant !== 'secondary' && !unavailable
            ? { color: foregroundColor }
            : undefined
        }
      >
        {children}
      </MobileText>
    </Pressable>
  );
}

export type MobileStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'submitted'
  | 'rework'
  | 'overdue'
  | 'failed'
  | 'change'
  | 'not_started'
  | 'disabled';

const statusDefinitions = {
  pending: {
    label: '待审',
    tone: 'muted',
    background: tokens.mobile.disabledBackground,
    Icon: CalendarDays,
  },
  in_progress: {
    label: '进行中',
    tone: 'primary',
    background: tokens.mobile.primaryTint,
    Icon: Clock3,
  },
  completed: {
    label: '已完成',
    tone: 'success',
    background: tokens.mobile.successTint,
    Icon: Check,
  },
  submitted: {
    label: '已提交',
    tone: 'success',
    background: tokens.mobile.successTint,
    Icon: Check,
  },
  rework: {
    label: '打回',
    tone: 'warning',
    background: tokens.mobile.warningTint,
    Icon: CornerUpLeft,
  },
  overdue: {
    label: '逾期',
    tone: 'danger',
    background: tokens.mobile.dangerTint,
    Icon: AlertTriangle,
  },
  failed: {
    label: '不合格',
    tone: 'danger',
    background: tokens.mobile.dangerTint,
    Icon: X,
  },
  change: {
    label: '已改判',
    tone: 'change',
    background: tokens.mobile.changeTint,
    Icon: ArrowLeftRight,
  },
  not_started: {
    label: '未开始',
    tone: 'disabled',
    background: tokens.mobile.disabledBackground,
    Icon: CalendarDays,
  },
  disabled: {
    label: '暂不可用',
    tone: 'disabled',
    background: tokens.mobile.disabledBackground,
    Icon: CalendarDays,
  },
} as const satisfies Record<
  MobileStatus,
  {
    label: string;
    tone: MobileTextTone;
    background: string;
    Icon: typeof Check;
  }
>;

export function MobileStatusTag({
  status,
  label,
  style,
}: {
  status: MobileStatus;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const definition = statusDefinitions[status];
  const Icon = definition.Icon;

  return (
    <View
      accessibilityRole="text"
      style={[
        styles.statusTag,
        { backgroundColor: definition.background },
        style,
      ]}
    >
      <Icon color={toneColors[definition.tone]} size={14} strokeWidth={2} />
      <MobileText role="fixed" size="xs" tone={definition.tone}>
        {label ?? definition.label}
      </MobileText>
    </View>
  );
}

const styles = {
  topBar: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.surface,
    borderBottomColor: tokens.mobile.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    minHeight: 56,
    paddingHorizontal: tokens.mobileSpace.lg,
    paddingVertical: tokens.mobileSpace.sm,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: tokens.mobileRadius.control,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  topBarHeading: {
    flex: 1,
    gap: tokens.mobileSpace.xs,
    minWidth: 0,
  },
  bottomBar: {
    backgroundColor: tokens.mobile.surface,
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
  },
  button: {
    alignItems: 'center',
    borderRadius: tokens.mobileRadius.control,
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: tokens.mobileSpace.lg,
  },
  statusTag: {
    alignItems: 'center',
    borderRadius: tokens.mobileRadius.control,
    flexDirection: 'row',
    gap: tokens.mobileSpace.xs,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: tokens.mobileSpace.sm,
  },
} satisfies Record<string, ViewStyle | TextStyle>;
