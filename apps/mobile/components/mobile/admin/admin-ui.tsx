import { Host, Picker, Switch, TextInput, useNativeState } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tokens from '../../../../../packages/tokens/native.json';
import { ErrorBanner } from '../error-banner';
import { PrimaryButton } from '../primary-button';
import { classes, styles } from '../styles';
import { useTabColors } from '../use-tab-colors';
import { BrandMark } from '../brand-mark';
import { useNotifications } from '../notification-provider';
import { Bell } from 'lucide-react-native';

export function AdminPage({
  title,
  children,
  loading,
  busy = false,
  error,
  message,
  onRefresh,
  showBack = true,
  backLabel = '返回',
  onBack,
  homeHeader = false,
  fixedFooter,
}: {
  title: string;
  children: ReactNode;
  loading: boolean;
  busy?: boolean;
  error: string | null;
  message?: string | null;
  onRefresh: () => void;
  showBack?: boolean;
  backLabel?: string;
  onBack?: () => void;
  homeHeader?: boolean;
  fixedFooter?: ReactNode;
}) {
  const router = useRouter();
  const colors = useTabColors();
  const { unreadCount } = useNotifications();

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/admin');
  }

  return (
    <SafeAreaView
      className={classes.background}
      edges={['top']}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios' ? 'padding' : fixedFooter ? 'height' : undefined
        }
        style={{ flex: 1 }}
      >
        {homeHeader ? (
          <View
            className={`${classes.card} border-b border-border`}
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'space-between',
              minHeight: 52,
              paddingHorizontal: tokens.space.md,
            }}
          >
            <View
              style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
            >
              <BrandMark size={26} />
              <Text className={classes.foreground} style={styles.cardTitle}>
                FloorWalk
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`通知${unreadCount ? `，${unreadCount} 条未读` : ''}`}
              onPress={() => router.push('/admin/notifications')}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
                minWidth: 44,
                position: 'relative',
              }}
              testID="admin-notifications"
            >
              <Bell color={colors.primary} size={22} />
              {unreadCount > 0 ? (
                <View
                  className={classes.notificationBadge}
                  style={styles.adminNotificationBadge}
                >
                  <Text
                    className={classes.notificationBadgeText}
                    style={styles.adminNotificationBadgeText}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[
              styles.page,
              fixedFooter ? { paddingBottom: tokens.space.md } : undefined,
            ]}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
            >
              {showBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={backLabel}
                  onPress={goBack}
                  style={({ pressed }) => [
                    {
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 44,
                      minWidth: 44,
                    },
                    pressed && styles.pressedRow,
                  ]}
                >
                  <Text className={classes.link} style={styles.link}>
                    {backLabel}
                  </Text>
                </Pressable>
              ) : null}
              <Text
                accessibilityRole="header"
                className={classes.foreground}
                style={[styles.heading, { flex: 1, marginTop: 0 }]}
              >
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={loading ? '正在刷新' : '刷新'}
                accessibilityState={{ disabled: loading || busy }}
                disabled={loading || busy}
                onPress={onRefresh}
                style={({ pressed }) => [
                  {
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 44,
                    minWidth: 44,
                  },
                  pressed && styles.pressedRow,
                ]}
              >
                <Text className={classes.link} style={styles.link}>
                  {loading ? '…' : '刷新'}
                </Text>
              </Pressable>
            </View>
            <ErrorBanner message={error} />
            {message ? (
              <Text
                accessibilityRole="alert"
                className={classes.success}
                style={styles.success}
              >
                {message}
              </Text>
            ) : null}
            {children}
          </ScrollView>
          {fixedFooter ? (
            <View
              className="border-t border-border bg-card"
              style={{ borderTopWidth: 1, padding: tokens.space.sm }}
            >
              {fixedFooter}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AdminCard({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View className={classes.card} style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

export function AdminText({ children }: { children: ReactNode }) {
  return (
    <Text className={classes.foreground} style={styles.value}>
      {children}
    </Text>
  );
}

export function AdminField({
  label,
  value,
  onChangeText,
  disabled = false,
  password = false,
  multiline = false,
  keyboardType = 'default',
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  disabled?: boolean;
  password?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
}) {
  const state = useNativeState(value);
  const colors = useTabColors();
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
          secureTextEntry={password}
          style={{
            width: '100%',
            height: multiline ? 112 : 48,
            borderRadius: tokens.radius.control,
            borderWidth: 1,
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

export function ConfirmAction({
  label,
  detail,
  onConfirm,
  disabled = false,
}: {
  label: string;
  detail: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <View style={{ gap: tokens.space.xs }}>
      <AdminText>{detail}</AdminText>
      <PrimaryButton
        disabled={disabled}
        variant="danger"
        onPress={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {`确认${label}`}
      </PrimaryButton>
      <PrimaryButton
        disabled={disabled}
        variant="secondary"
        onPress={() => setConfirming(false)}
      >
        取消
      </PrimaryButton>
    </View>
  ) : (
    <PrimaryButton
      disabled={disabled}
      variant="secondary"
      onPress={() => setConfirming(true)}
    >
      {label}
    </PrimaryButton>
  );
}
