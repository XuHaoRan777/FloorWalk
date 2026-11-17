import {
  avatarMimeTypes,
  maxAvatarSizeBytes,
  updateMeRequestSchema,
  type CurrentUser,
} from '@libs/shared';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import {
  api,
  ApiError,
  AvatarInputError,
  userFacingError,
} from '../../lib/api';
import { AdminField } from './admin/admin-ui';
import { PrimaryButton } from './primary-button';
import { ErrorBanner } from './error-banner';
import type { Session } from './session';
import { classes, styles } from './styles';

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

  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      {onBack ? (
        <PrimaryButton
          disabled={busy !== null}
          onPress={onBack}
          variant="secondary"
        >
          返回管理主页
        </PrimaryButton>
      ) : null}
      <Text className={classes.eyebrow} style={styles.eyebrow}>
        我的
      </Text>
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.heading}
      >
        账号信息
      </Text>
      <PrimaryButton
        disabled={locked}
        onPress={() => void refreshProfile()}
        variant="secondary"
      >
        {loading ? '加载中…' : '刷新资料'}
      </PrimaryButton>
      <ErrorBanner message={error ?? logoutError ?? null} />
      {message ? (
        <Text
          accessibilityRole="alert"
          className={classes.success}
          style={styles.success}
        >
          {message}
        </Text>
      ) : null}
      <View className={classes.card} style={styles.card}>
        <Text className={classes.muted} style={styles.label}>
          头像
        </Text>
        {profile?.avatarUrl && !avatarFailed ? (
          <View style={styles.photoPreview}>
            <Image
              accessibilityLabel="当前头像"
              onError={() => setAvatarFailed(true)}
              source={{ uri: profile.avatarUrl }}
              style={styles.photoImage}
              testID="profile-avatar"
            />
          </View>
        ) : (
          <Text className={classes.muted} style={styles.muted}>
            {avatarFailed
              ? '头像加载失败，请刷新资料重试。'
              : profile
                ? '尚未设置头像'
                : loading
                  ? '加载头像中…'
                  : '头像资料暂不可用'}
          </Text>
        )}
        <Text className={classes.muted} style={styles.muted}>
          JPEG 或 PNG，最大 2MB
        </Text>
        <PrimaryButton
          disabled={locked}
          onPress={() => void chooseAvatar()}
          variant="secondary"
          testID="profile-change-avatar"
        >
          {busy === 'avatar' ? '处理头像中…' : '改头像'}
        </PrimaryButton>
        <Text className={classes.muted} style={styles.label}>
          昵称
        </Text>
        <Text
          accessibilityLabel="当前昵称"
          className={classes.foreground}
          style={styles.value}
        >
          {current.displayName}
        </Text>
        {current.role === 'admin' ? (
          editingName ? (
            <View>
              <AdminField
                label="昵称"
                value={draftName}
                onChangeText={setDraftName}
                disabled={locked}
                maxLength={30}
              />
              <PrimaryButton disabled={locked} onPress={() => void saveName()}>
                {busy === 'nickname' ? '保存中…' : '保存昵称'}
              </PrimaryButton>
              <PrimaryButton
                disabled={locked}
                onPress={() => setEditingName(false)}
                variant="secondary"
              >
                取消编辑
              </PrimaryButton>
            </View>
          ) : (
            <PrimaryButton
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
            </PrimaryButton>
          )
        ) : null}
        <Text className={classes.muted} style={styles.label}>
          登录名（只读）
        </Text>
        <Text
          accessibilityLabel="当前登录名"
          className={classes.foreground}
          style={styles.value}
        >
          {current.loginName}
        </Text>
        <Text className={classes.muted} style={styles.label}>
          角色
        </Text>
        <Text
          accessibilityLabel="当前角色"
          className={classes.foreground}
          style={styles.value}
        >
          {current.role === 'admin' ? '管理员' : '店长'}
        </Text>
        {current.role === 'store_manager' ? (
          <View>
            <Text className={classes.muted} style={styles.label}>
              所属门店
            </Text>
            <Text
              accessibilityLabel="当前门店"
              className={classes.foreground}
              style={styles.value}
            >
              {profile?.site?.name ??
                (loading
                  ? '加载中…'
                  : profile
                    ? '未绑定门店'
                    : '暂时无法加载门店')}
            </Text>
          </View>
        ) : null}
      </View>
      <PrimaryButton
        disabled={locked}
        onPress={() => router.push('/change-password')}
        variant="secondary"
      >
        改密码
      </PrimaryButton>
      <PrimaryButton
        disabled={busy !== null}
        onPress={onLogout}
        variant="secondary"
      >
        退出登录
      </PrimaryButton>
    </ScrollView>
  );
}
