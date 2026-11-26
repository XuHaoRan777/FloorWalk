import {
  avatarMimeTypes,
  maxAvatarSizeBytes,
  updateMeRequestSchema,
  type CurrentUser,
} from '@libs/shared';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserRound } from 'lucide-react-native';
import {
  api,
  ApiError,
  AvatarInputError,
  userFacingError,
} from '../../lib/api';
import { AdminField } from './admin/admin-ui';
import { ManagerProfileScreen } from './manager-profile-screen';
import { ErrorBanner } from './error-banner';
import { MobileSurfaceCard } from './manager-data-ui';
import { MobileButton, MobileText } from './manager-ui';
import { BrandMark } from './brand-mark';
import type { Session } from './session';
import tokens from '../../../../packages/tokens/native.json';

export function ProfileScreen({
  session,
  onProfileChange,
  onExpired,
  onLogout,
  logoutError,
  onBack,
}: {
  session: Session;
  onProfileChange: (session: Session) => void;
  onExpired: () => void;
  onLogout: () => void;
  logoutError?: string | null;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const loadVersion = useRef(0);
  const [busy, setBusy] = useState<'avatar' | 'nickname' | null>(null);
  const busyRef = useRef(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const current = profile ?? session.user;
  const locked = loading || busy !== null;

  const reportError = useCallback(
    (cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired();
        return;
      }
      setError(
        cause instanceof AvatarInputError
          ? cause.message
          : userFacingError(cause),
      );
    },
    [onExpired],
  );

  const applyProfile = useCallback(
    (user: CurrentUser) => {
      setProfile(user);
      setAvatarFailed(false);
      onProfileChange({ user });
    },
    [onProfileChange],
  );

  const refreshProfile = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const user = await api.me();
      if (version === loadVersion.current) applyProfile(user);
    } catch (cause) {
      if (version === loadVersion.current) reportError(cause);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [applyProfile, reportError]);

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
      return () => {
        loadVersion.current += 1;
      };
    }, [refreshProfile]),
  );

  if (current.role === 'store_manager') {
    return (
      <ManagerProfileScreen
        profile={profile}
        current={current}
        loading={loading}
        locked={locked}
        busy={busy}
        error={error ?? logoutError ?? null}
        message={message}
        avatarFailed={avatarFailed}
        onAvatarError={() => setAvatarFailed(true)}
        onRefresh={() => void refreshProfile()}
        onChooseAvatar={() => void chooseAvatar()}
        onChangePassword={() => router.push('/change-password')}
        onLogout={onLogout}
      />
    );
  }

  async function saveName() {
    if (busyRef.current || loading) return;
    const input = updateMeRequestSchema.safeParse({ displayName: draftName });
    if (!input.success) {
      setError('昵称需为 1～30 字。');
      return;
    }
    busyRef.current = true;
    setBusy('nickname');
    setError(null);
    setMessage(null);
    try {
      await api.updateMe(input.data);
      applyProfile(await api.me());
      setEditingName(false);
      setMessage('昵称已保存。');
    } catch (cause) {
      reportError(cause);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function chooseAvatar() {
    if (busyRef.current || loading) return;
    busyRef.current = true;
    setBusy('avatar');
    setError(null);
    setMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (
        asset.mimeType &&
        !avatarMimeTypes.some((supported) => supported === asset.mimeType)
      ) {
        throw new AvatarInputError('仅支持 JPEG 或 PNG 头像。');
      }
      if (asset.fileSize !== undefined && asset.fileSize > maxAvatarSizeBytes) {
        throw new AvatarInputError('头像不能超过 2MB。');
      }
      await api.uploadAvatar(
        asset.uri,
        asset.fileName ??
          (asset.mimeType === 'image/png' ? 'avatar.png' : 'avatar.jpg'),
      );
      applyProfile(await api.me());
      setMessage('头像已更新。');
    } catch (cause) {
      reportError(cause);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const pageDate = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());

  return (
    <SafeAreaView
      edges={['top']}
      style={{ backgroundColor: tokens.mobile.background, flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{
          gap: 16,
          paddingBottom: 24,
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {onBack ? (
          <MobileButton
            disabled={busy !== null}
            onPress={onBack}
            variant="secondary"
          >
            返回管理主页
          </MobileButton>
        ) : null}
        <View style={{ gap: 12 }}>
          <View
            style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
          >
            <BrandMark size={34} />
            <MobileText role="fixed" size="sm" style={{ flex: 1 }}>
              商家巡检管理 · 管理员
            </MobileText>
            <MobileText role="number" size="xs" tone="muted">
              {pageDate}
            </MobileText>
          </View>
          <View style={{ gap: 2 }}>
            <MobileText
              accessibilityRole="header"
              role="title"
              size="2xl"
            >
              我的
            </MobileText>
            <MobileText size="sm" tone="muted">
              管理员账户
            </MobileText>
          </View>
        </View>
        <MobileButton
          disabled={locked}
          onPress={() => void refreshProfile()}
          variant="secondary"
        >
          {loading ? '加载中…' : '刷新资料'}
        </MobileButton>
        <ErrorBanner message={error ?? logoutError ?? null} />
        {message ? (
          <MobileText accessibilityRole="alert" size="sm" tone="success">
            {message}
          </MobileText>
        ) : null}
        <MobileSurfaceCard style={{ gap: 16 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
            {profile?.avatarUrl && !avatarFailed ? (
              <Image
                accessibilityLabel="当前头像"
                onError={() => setAvatarFailed(true)}
                source={{ uri: profile.avatarUrl }}
                style={{
                  borderRadius: tokens.mobileRadius.pill,
                  height: 64,
                  width: 64,
                }}
                testID="profile-avatar"
              />
            ) : (
              <View
                accessibilityLabel={
                  avatarFailed
                    ? '头像加载失败，请刷新资料重试。'
                    : profile
                      ? '尚未设置头像'
                      : loading
                        ? '加载头像中…'
                        : '头像资料暂不可用'
                }
                style={{
                  alignItems: 'center',
                  backgroundColor: tokens.mobile.primarySoft,
                  borderRadius: tokens.mobileRadius.pill,
                  height: 64,
                  justifyContent: 'center',
                  width: 64,
                }}
              >
                <UserRound color={tokens.mobile.primary} size={28} />
              </View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <MobileText role="fixed" size="lg" numberOfLines={2}>
                {current.displayName}
              </MobileText>
              <MobileText size="sm" tone="muted">
                当前角色 · 管理员
              </MobileText>
            </View>
          </View>
          <View style={{ gap: 5 }}>
            <MobileText role="fixed" size="xs" tone="muted">
              昵称
            </MobileText>
            {editingName ? (
              <View style={{ gap: 8 }}>
                <AdminField
                  label="昵称"
                  value={draftName}
                  onChangeText={setDraftName}
                  disabled={locked}
                  maxLength={30}
                  visual="route"
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <MobileButton
                    disabled={locked}
                    onPress={() => void saveName()}
                  >
                    {busy === 'nickname' ? '保存中…' : '保存昵称'}
                  </MobileButton>
                  <MobileButton
                    disabled={locked}
                    onPress={() => setEditingName(false)}
                    variant="secondary"
                  >
                    取消编辑
                  </MobileButton>
                </View>
              </View>
            ) : (
              <>
                <MobileText accessibilityLabel="当前昵称" size="base">
                  {current.displayName}
                </MobileText>
                <MobileButton
                  disabled={locked}
                  onPress={() => {
                    setDraftName(current.displayName);
                    setEditingName(true);
                    setError(null);
                    setMessage(null);
                  }}
                  variant="secondary"
                >
                  编辑昵称
                </MobileButton>
              </>
            )}
          </View>
          <View style={{ gap: 5 }}>
            <MobileText role="fixed" size="xs" tone="muted">
              登录名（只读）
            </MobileText>
            <MobileText accessibilityLabel="当前登录名" selectable>
              {current.loginName}
            </MobileText>
          </View>
          <View style={{ gap: 5 }}>
            <MobileText role="fixed" size="xs" tone="muted">
              角色
            </MobileText>
            <MobileText accessibilityLabel="当前角色">管理员</MobileText>
          </View>
          <View style={{ gap: 4 }}>
            <MobileText size="xs" tone="muted">
              JPEG 或 PNG，最大 2MB
            </MobileText>
            <MobileButton
              disabled={locked}
              onPress={() => void chooseAvatar()}
              variant="secondary"
              testID="profile-change-avatar"
            >
              {busy === 'avatar' ? '处理头像中…' : '改头像'}
            </MobileButton>
          </View>
        </MobileSurfaceCard>
        <MobileButton
          disabled={locked}
          onPress={() => router.push('/change-password')}
          variant="secondary"
        >
          修改密码
        </MobileButton>
        <MobileButton
          disabled={busy !== null}
          onPress={onLogout}
          variant="secondary"
        >
          退出登录
        </MobileButton>
      </ScrollView>
    </SafeAreaView>
  );
}

