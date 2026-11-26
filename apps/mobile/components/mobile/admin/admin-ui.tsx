import { createContext, useContext } from 'react';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import tokens from '../../../../../packages/tokens/native.json';
import { ErrorBanner } from '../error-banner';
import { PrimaryButton } from '../primary-button';
import { classes, styles } from '../styles';
import { useTabColors } from '../use-tab-colors';
import { BrandMark } from '../brand-mark';
import { useNotifications } from '../notification-provider';
import { Bell } from 'lucide-react-native';
import { MobileText } from '../manager-ui';
export { AdminField, AdminSelect, AdminToggle } from './admin-fields';

const AdminVisualContext = createContext<'shared' | 'route'>('shared');
const routeStyles = {
  heading: {
    fontFamily: tokens.font.sans.semibold,
    fontSize: tokens.mobileType.title,
    fontWeight: '700' as const,
    lineHeight: 29,
  },
  body: {
    fontFamily: tokens.font.sans.regular,
    fontSize: tokens.mobileType.sm,
    lineHeight: 20,
  },
  page: {
    padding: tokens.mobileSpace.md,
    paddingBottom: tokens.space.xxl,
    gap: tokens.mobileSpace.md,
  },
  card: {
    borderRadius: tokens.mobileRadius.control,
    gap: tokens.mobileSpace.sm,
    padding: tokens.mobileSpace.md,
  },
};

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
  homeHeaderLabel = '门店运营',
  homeHeaderMeta,
  fixedFooter,
  visual = 'shared',
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
  homeHeaderLabel?: string;
  homeHeaderMeta?: string;
  fixedFooter?: ReactNode;
  visual?: 'shared' | 'route';
}) {
  const router = useRouter();
  const colors = useTabColors();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const [focusedControl, setFocusedControl] = useState<string | null>(null);

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/admin');
  }

  const pageHeader = (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={goBack}
          onFocus={() => setFocusedControl('back')}
          onBlur={() => setFocusedControl(null)}
          style={({ pressed }) => [
            {
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              minWidth: 44,
            },
            pressed && styles.pressedRow,
            focusedControl === 'back' && {
              borderWidth: 2,
              borderColor: colors.primary,
              borderRadius: 8,
            },
          ]}
        >
          <Text className={classes.link} style={styles.link}>
            {backLabel}
          </Text>
        </Pressable>
      ) : null}
      <Text
        accessibilityRole="header"
        className={
          visual === 'route' ? classes.mobileForeground : classes.foreground
        }
        style={[
          visual === 'route' ? routeStyles.heading : styles.heading,
          { flex: 1, marginTop: 0 },
        ]}
      >
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={loading ? '正在刷新' : '刷新'}
        accessibilityState={{ disabled: loading || busy }}
        disabled={loading || busy}
        onPress={onRefresh}
        onFocus={() => setFocusedControl('refresh')}
        onBlur={() => setFocusedControl(null)}
        style={({ pressed }) => [
          {
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            minWidth: 44,
          },
          pressed && styles.pressedRow,
          focusedControl === 'refresh' && {
            borderWidth: 2,
            borderColor: colors.primary,
            borderRadius: 8,
          },
        ]}
      >
        <Text className={classes.link} style={styles.link}>
          {loading ? '…' : '刷新'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <AdminVisualContext.Provider value={visual}>
      <SafeAreaView
        className={
          visual === 'route' ? classes.mobileBackground : classes.background
        }
        edges={['top']}
        style={{ flex: 1 }}
      >
        <KeyboardAvoidingView
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : fixedFooter
                ? 'height'
                : undefined
          }
          style={{ flex: 1 }}
        >
          {homeHeader ? (
            <View
              className={`${visual === 'route' ? classes.mobileSurface : classes.card} border-b ${visual === 'route' ? classes.mobileBorder : 'border-border'}`}
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
                <BrandMark size={visual === 'route' ? 34 : 26} />
                <MobileText role="fixed" size="base">
                  {homeHeaderLabel}
                </MobileText>
              </View>
              {homeHeaderMeta ? (
                <MobileText
                  role="number"
                  size="xs"
                  tone="muted"
                  style={{ flex: 1, textAlign: 'right' }}
                >
                  {homeHeaderMeta}
                </MobileText>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`通知${unreadCount ? `，${unreadCount} 条未读` : ''}`}
                onPress={() => router.push('/admin/notifications')}
                onFocus={() => setFocusedControl('notifications')}
                onBlur={() => setFocusedControl(null)}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  minWidth: 44,
                  position: 'relative',
                  borderWidth: focusedControl === 'notifications' ? 2 : 0,
                  borderColor: colors.primary,
                  borderRadius: 8,
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
          {visual === 'route' ? (
            <View
              className={`${classes.mobileSurface} border-b ${classes.mobileBorder}`}
              style={{ paddingHorizontal: tokens.mobileSpace.md }}
            >
              {pageHeader}
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <ScrollView
              className={
                visual === 'route'
                  ? classes.mobileBackground
                  : classes.background
              }
              contentContainerStyle={[
                visual === 'route' ? routeStyles.page : styles.page,
                fixedFooter ? { paddingBottom: tokens.space.md } : undefined,
              ]}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
            >
              {visual === 'route' ? null : pageHeader}
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
                className={`${visual === 'route' ? classes.mobileSurface : 'bg-card'} border-t ${visual === 'route' ? classes.mobileBorder : 'border-border'}`}
                style={{
                  borderTopWidth: 1,
                  padding: tokens.space.sm,
                  paddingBottom:
                    visual === 'route'
                      ? tokens.space.sm + insets.bottom
                      : tokens.space.sm,
                }}
              >
                {fixedFooter}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AdminVisualContext.Provider>
  );
}

export function AdminCard({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return <AdminCardContent children={children} testID={testID} />;
}

function AdminCardContent({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  const visual = useContext(AdminVisualContext);
  return (
    <View
      className={
        visual === 'route'
          ? `${classes.mobileSurface} border ${classes.mobileBorder}`
          : classes.card
      }
      style={visual === 'route' ? routeStyles.card : styles.card}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function AdminText({ children }: { children: ReactNode }) {
  const visual = useContext(AdminVisualContext);
  return (
    <Text
      className={
        visual === 'route' ? classes.mobileForeground : classes.foreground
      }
      style={visual === 'route' ? routeStyles.body : styles.value}
    >
      {children}
    </Text>
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
