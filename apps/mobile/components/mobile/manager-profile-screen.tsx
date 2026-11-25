import { ChevronRight, RefreshCw, UserRound } from 'lucide-react-native';
import type { CurrentUser, User } from '@libs/shared';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark } from './brand-mark';
import { ErrorBanner } from './error-banner';
import { MobileSurfaceCard } from './manager-data-ui';
import { MobileButton, MobileText, MobileTopBar } from './manager-ui';
import tokens from '../../../../packages/tokens/native.json';

type AvatarBusyState = 'avatar' | 'nickname' | null;

export function ManagerProfileScreen({
  profile,
  current,
  loading,
  locked,
  busy,
  error,
  message,
  avatarFailed,
  onAvatarError,
  onRefresh,
  onChooseAvatar,
  onChangePassword,
  onLogout,
}: {
  profile: CurrentUser | null;
  current: User;
  loading: boolean;
  locked: boolean;
  busy: AvatarBusyState;
  error: string | null;
  message: string | null;
  avatarFailed: boolean;
  onAvatarError: () => void;
  onRefresh: () => void;
  onChooseAvatar: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const siteName =
    profile?.site?.name ??
    (loading
      ? '加载中…'
      : profile
        ? '未绑定门店'
        : '暂时无法加载门店');
  const trailing = (
    <View style={styles.headerActions}>
      <MobileText role="number" size="xs" tone="muted">
        {new Intl.DateTimeFormat('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
        }).format(new Date())}
      </MobileText>
      <Pressable
        accessibilityLabel="刷新资料"
        accessibilityRole="button"
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={onRefresh}
        style={({ pressed }) => [
          styles.refreshButton,
          pressed && styles.pressedButton,
        ]}
      >
        <RefreshCw color={tokens.mobile.primary} size={18} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <MobileTopBar
        leading={<BrandMark size={30} />}
        title={profile?.site?.name ?? 'FloorWalk'}
        titleRole="body"
        titleSize="base"
        subtitle={`店长 ${current.displayName}`}
        trailing={trailing}
      />
      <ScrollView
        contentContainerStyle={styles.page}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeading}>
          <MobileText accessibilityRole="header" role="title" size="2xl">
            我的
          </MobileText>
          <MobileText role="fixed" size="sm" tone="muted">
            店长账户
          </MobileText>
        </View>
        <ErrorBanner message={error} />
        {message ? (
          <MobileText
            accessibilityRole="alert"
            size="sm"
            tone="success"
            style={styles.message}
          >
            {message}
          </MobileText>
        ) : null}
        <MobileSurfaceCard style={styles.profileCard}>
          <View style={styles.identityRow}>
            {profile?.avatarUrl && !avatarFailed ? (
              <Image
                accessibilityLabel="当前头像"
                onError={onAvatarError}
                source={{ uri: profile.avatarUrl }}
                style={styles.avatar}
                testID="profile-avatar"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <UserRound
                  color={tokens.mobile.primaryText}
                  size={28}
                  strokeWidth={1.7}
                />
              </View>
            )}
            <View style={styles.identityCopy}>
              <MobileText
                accessibilityLabel="当前昵称"
                size="lg"
                numberOfLines={2}
              >
                {current.displayName}
              </MobileText>
              <MobileText size="sm" tone="muted" numberOfLines={2}>
                店长 · {siteName}
              </MobileText>
            </View>
          </View>
          <View style={styles.avatarActions}>
            <View style={styles.avatarHelp}>
              <MobileText role="fixed" size="sm">
                头像
              </MobileText>
              <MobileText size="xs" tone="muted">
                {avatarFailed
                  ? '头像加载失败，请刷新资料重试。'
                  : profile
                    ? '尚未设置头像'
                    : loading
                      ? '加载头像中…'
                      : '头像资料暂不可用'}
              </MobileText>
              <MobileText size="xs" tone="muted">
                JPEG 或 PNG，最大 2MB
              </MobileText>
            </View>
            <MobileButton
              disabled={locked}
              onPress={onChooseAvatar}
              variant="secondary"
              testID="profile-change-avatar"
            >
              {busy === 'avatar' ? '处理中…' : '改头像'}
            </MobileButton>
          </View>
        </MobileSurfaceCard>
        <MobileSurfaceCard style={styles.accountCard}>
          <View style={styles.accountHeading}>
            <View style={styles.accountIcon}>
              <UserRound color={tokens.mobile.primaryText} size={20} />
            </View>
            <View style={styles.identityCopy}>
              <MobileText role="fixed" size="base">
                账号资料
              </MobileText>
              <MobileText size="sm" tone="muted">
                登录信息
              </MobileText>
            </View>
            <ChevronRight color={tokens.mobile.mutedForeground} size={18} />
          </View>
          <View style={styles.profileFields}>
            <View style={styles.profileField}>
              <MobileText role="fixed" size="sm" tone="muted">
                登录名（只读）
              </MobileText>
              <MobileText
                accessibilityLabel="当前登录名"
                size="sm"
                numberOfLines={2}
                style={styles.profileFieldValue}
              >
                {current.loginName}
              </MobileText>
            </View>
            <View style={styles.profileField}>
              <MobileText role="fixed" size="sm" tone="muted">
                角色
              </MobileText>
              <MobileText
                accessibilityLabel="当前角色"
                size="sm"
                style={styles.profileFieldValue}
              >
                店长
              </MobileText>
            </View>
            <View style={styles.profileField}>
              <MobileText role="fixed" size="sm" tone="muted">
                所属门店
              </MobileText>
              <MobileText
                accessibilityLabel="当前门店"
                size="sm"
                numberOfLines={2}
                style={styles.profileFieldValue}
              >
                {siteName}
              </MobileText>
            </View>
          </View>
        </MobileSurfaceCard>
        <MobileButton
          disabled={locked}
          onPress={onChangePassword}
          variant="secondary"
          style={styles.actionButton}
        >
          修改密码
        </MobileButton>
        <MobileButton
          disabled={busy !== null}
          onPress={onLogout}
          variant="secondary"
          style={styles.actionButton}
        >
          退出登录
        </MobileButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.mobile.background, flex: 1 },
  page: {
    gap: tokens.mobileSpace.md,
    paddingBottom: tokens.mobileSpace.display,
    paddingHorizontal: tokens.mobileSpace.lg,
    paddingTop: tokens.mobileSpace.lg,
  },
  pageHeading: { gap: tokens.mobileSpace.xs },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.mobileSpace.xs,
  },
  refreshButton: {
    alignItems: 'center',
    borderRadius: tokens.mobileRadius.control,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressedButton: { backgroundColor: tokens.mobile.primarySoft },
  message: {
    backgroundColor: tokens.mobile.successTint,
    borderRadius: tokens.mobileRadius.control,
    padding: tokens.mobileSpace.md,
  },
  profileCard: { borderRadius: tokens.mobileRadius.large },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.mobileSpace.md,
  },
  avatar: {
    backgroundColor: tokens.mobile.primarySoft,
    borderRadius: tokens.mobileRadius.pill,
    height: 64,
    width: 64,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.primarySoft,
    borderRadius: tokens.mobileRadius.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  identityCopy: { flex: 1, gap: tokens.mobileSpace.xs, minWidth: 0 },
  avatarActions: {
    alignItems: 'center',
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    justifyContent: 'space-between',
    paddingTop: tokens.mobileSpace.md,
  },
  avatarHelp: { flex: 1, gap: tokens.mobileSpace.xs, minWidth: 0 },
  accountCard: { borderRadius: tokens.mobileRadius.control },
  accountHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.mobileSpace.md,
  },
  accountIcon: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.primarySoft,
    borderRadius: tokens.mobileRadius.control,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  profileFields: {
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
    gap: tokens.mobileSpace.md,
    paddingTop: tokens.mobileSpace.sm,
  },
  profileField: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.mobileSpace.md,
    justifyContent: 'space-between',
  },
  profileFieldValue: { flex: 1, minWidth: 0, textAlign: 'right' },
  actionButton: { alignSelf: 'stretch', minHeight: 48 },
});
