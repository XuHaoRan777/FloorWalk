import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { InspectionDetail, TodayResponse, User } from '@libs/shared';
import { api, ApiError, userFacingError } from '../lib/api';
import { clearAuthToken, getAuthToken, setAuthToken } from '../lib/storage';

type Session = { token: string; user: User };
type Screen = 'today' | 'profile';

function PrimaryButton({
  children,
  onPress,
  disabled = false,
  variant = 'primary',
  testID,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && styles.secondaryButtonText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={styles.error}>
      {message}
    </Text>
  );
}

function LoginScreen({
  onLogin,
  initialError = null,
}: {
  onLogin: (session: Session) => void;
  initialError?: string | null;
}) {
  const [email, setEmail] = useState('inspector@northbean.example');
  const [password, setPassword] = useState('northbean-demo');
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.login(email.trim(), password);
      await setAuthToken(response.token);
      onLogin(response);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? '邮箱或密码错误。'
          : userFacingError(cause),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.centered}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>NORTHBEAN COFFEE · 店员端</Text>
      <Text accessibilityRole="header" style={styles.title}>
        开始巡检
      </Text>
      <Text style={styles.description}>
        登录后查看今日任务、拍照并提交巡检结果。
      </Text>
      <View style={styles.form}>
        <Text style={styles.label}>邮箱</Text>
        <TextInput
          accessibilityLabel="邮箱"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          style={styles.input}
          value={email}
        />
        <Text style={styles.label}>密码</Text>
        <TextInput
          accessibilityLabel="密码"
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <ErrorBanner message={error} />
        <PrimaryButton
          disabled={loading}
          onPress={() => void submit()}
          testID="login-button"
        >
          {loading ? '登录中…' : '登录'}
        </PrimaryButton>
      </View>
    </ScrollView>
  );
}

function TodayScreen({
  session,
  today,
  onRefresh,
  onOpenInspection,
  onUnauthorized,
}: {
  session: Session;
  today: TodayResponse | null;
  onRefresh: () => void;
  onOpenInspection: (id: string) => void;
  onUnauthorized: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startInspection() {
    if (!today) return;
    setLoading(true);
    setError(null);
    try {
      const created = await api.createInspection(
        session.token,
        today.template.id,
      );
      onOpenInspection(created.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setLoading(false);
    }
  }

  if (!today) {
    return (
      <View style={styles.centered}>
        <Text style={styles.description}>正在加载今日任务…</Text>
        <ErrorBanner message={error} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>今日待巡</Text>
          <Text accessibilityRole="header" style={styles.heading}>
            {today.site.name}
          </Text>
        </View>
        <Pressable accessibilityLabel="刷新今日任务" onPress={onRefresh}>
          <Text style={styles.link}>刷新</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>检查模板</Text>
        <Text style={styles.cardTitle}>{today.template.name}</Text>
        <Text style={styles.muted}>
          {today.template.items.length} 个检查项 ·{' '}
          {today.submittedToday ? '今天已提交' : '今天尚未提交'}
        </Text>
        <PrimaryButton
          disabled={loading}
          onPress={() => void startInspection()}
          testID="start-inspection"
        >
          {loading ? '准备中…' : '开始巡检'}
        </PrimaryButton>
      </View>
      <ErrorBanner message={error} />
      <Text style={styles.sectionTitle}>被打回的巡检</Text>
      {today.reworkInspections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.muted}>当前没有待补交的巡检。</Text>
        </View>
      ) : (
        today.reworkInspections.map((inspection) => (
          <Pressable
            accessibilityRole="button"
            key={inspection.id}
            onPress={() => onOpenInspection(inspection.id)}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>
              巡检单 {inspection.id.slice(0, 8)}
            </Text>
            <Text style={styles.muted}>
              状态：待补交
              {inspection.score === null ? '' : ` · ${inspection.score} 分`}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function ProfileScreen({
  session,
  siteName,
  onLogout,
}: {
  session: Session;
  siteName: string;
  onLogout: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>我的</Text>
      <Text accessibilityRole="header" style={styles.heading}>
        账号信息
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>姓名</Text>
        <Text style={styles.value}>{session.user.displayName}</Text>
        <Text style={styles.label}>邮箱</Text>
        <Text accessibilityLabel="当前邮箱" style={styles.value}>
          {session.user.email}
        </Text>
        <Text style={styles.label}>所属门店</Text>
        <Text accessibilityLabel="当前门店" style={styles.value}>
          {siteName || session.user.siteId || '未绑定门店'}
        </Text>
      </View>
      <PrimaryButton onPress={onLogout} variant="secondary">
        退出登录
      </PrimaryButton>
    </ScrollView>
  );
}

function InspectionScreen({
  session,
  id,
  onBack,
  onUnauthorized,
}: {
  session: Session;
  id: string;
  onBack: () => void;
  onUnauthorized: () => void;
}) {
  const [detail, setDetail] = useState<InspectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<{
    score: number | null;
    status: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setDetail(await api.inspection(session.token, id));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      setError(userFacingError(cause));
    }
  }, [id, onUnauthorized, session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestRework = useMemo(() => {
    if (!detail) return null;
    return (
      [...detail.reviews]
        .reverse()
        .find((review) => review.action === 'rework') ?? null
    );
  }, [detail]);

  async function updateItem(itemId: string, result: 'pass' | 'fail') {
    if (!detail) return;
    setBusy(itemId);
    try {
      await api.updateItem(
        session.token,
        detail.id,
        itemId,
        result,
        notes[itemId] ??
          detail.items.find((item) => item.id === itemId)?.note ??
          null,
      );
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto(itemId: string) {
    if (!detail) return;
    setBusy(itemId);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await api.uploadEvidence(
        session.token,
        detail.id,
        itemId,
        asset.uri,
        asset.fileName ?? `inspection-${itemId}.jpg`,
        asset.mimeType ?? 'image/jpeg',
      );
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!detail) return;
    const missing = detail.items.filter(
      (item) =>
        item.result === 'pending' ||
        (item.photoRequired && item.evidence.length === 0),
    );
    if (missing.length > 0) {
      setError(`请完成：${missing.map((item) => item.title).join('、')}`);
      return;
    }
    setBusy('submit');
    try {
      for (const item of detail.items) {
        if (item.result !== 'pending' && notes[item.id] !== undefined) {
          await api.updateItem(
            session.token,
            detail.id,
            item.id,
            item.result,
            notes[item.id] ?? item.note ?? null,
          );
        }
      }
      const response = await api.submit(session.token, detail.id);
      setSubmitted(response);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setBusy(null);
    }
  }

  if (!detail)
    return (
      <View style={styles.centered}>
        <Text style={styles.description}>正在加载巡检单…</Text>
        <ErrorBanner message={error} />
      </View>
    );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityLabel="返回今日待巡" onPress={onBack}>
        <Text style={styles.link}>‹ 返回今日待巡</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.heading}>
        巡检详情
      </Text>
      {latestRework && (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>主管打回</Text>
          <Text>
            {latestRework.comment || '请修改被标记的检查项后重新提交。'}
          </Text>
        </View>
      )}
      {detail.items.map((item) => {
        const highlighted =
          latestRework?.reworkItemIds?.includes(item.id) ?? false;
        return (
          <View
            key={item.id}
            style={[styles.card, highlighted && styles.highlightedCard]}
            testID={`inspection-item-${item.position}`}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.cardTitle}>
                {item.position}. {item.title}
              </Text>
              {item.photoRequired && <Text style={styles.required}>必拍</Text>}
            </View>
            {highlighted && (
              <Text style={styles.highlightText}>需要补充或修改</Text>
            )}
            <View style={styles.actionRow}>
              <PrimaryButton
                disabled={busy === item.id}
                onPress={() => void updateItem(item.id, 'pass')}
              >
                合格
              </PrimaryButton>
              <PrimaryButton
                disabled={busy === item.id}
                onPress={() => void updateItem(item.id, 'fail')}
                variant="danger"
              >
                不合格
              </PrimaryButton>
            </View>
            <Text style={styles.muted}>
              当前结果：
              {item.result === 'pending'
                ? '未填写'
                : item.result === 'pass'
                  ? '合格'
                  : '不合格'}
            </Text>
            <TextInput
              accessibilityLabel={`${item.title}备注`}
              onChangeText={(value) =>
                setNotes((current) => ({ ...current, [item.id]: value }))
              }
              placeholder="填写现场备注（可选）"
              style={styles.noteInput}
              value={notes[item.id] ?? item.note ?? ''}
            />
            {item.photoRequired && (
              <PrimaryButton
                disabled={busy === item.id}
                onPress={() => void addPhoto(item.id)}
                variant="secondary"
              >
                {item.evidence.length
                  ? `已上传 ${item.evidence.length} 张照片`
                  : '选择照片'}
              </PrimaryButton>
            )}
          </View>
        );
      })}
      <ErrorBanner message={error} />
      {submitted && (
        <View style={styles.success}>
          <Text>
            已提交：{submitted.status}，分数 {submitted.score ?? '待审核'}
          </Text>
        </View>
      )}
      <PrimaryButton
        disabled={busy === 'submit' || detail.status === 'submitted'}
        onPress={() => void submit()}
        testID="submit-inspection"
      >
        {busy === 'submit' ? '提交中…' : '提交巡检'}
      </PrimaryButton>
    </ScrollView>
  );
}

function AuthenticatedApp({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  const [screen, setScreen] = useState<Screen>('today');
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    try {
      setLoadingError(null);
      setToday(await api.today(session.token));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onLogout();
      else setLoadingError(userFacingError(cause));
    }
  }, [onLogout, session.token]);
  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  if (inspectionId)
    return (
      <InspectionScreen
        id={inspectionId}
        onBack={() => {
          setInspectionId(null);
          void loadToday();
        }}
        onUnauthorized={onLogout}
        session={session}
      />
    );

  return (
    <View style={styles.app}>
      {screen === 'today' ? (
        <TodayScreen
          onOpenInspection={setInspectionId}
          onRefresh={() => void loadToday()}
          onUnauthorized={onLogout}
          session={session}
          today={today}
        />
      ) : (
        <ProfileScreen
          onLogout={onLogout}
          session={session}
          siteName={today?.site.name ?? ''}
        />
      )}
      {loadingError && <ErrorBanner message={loadingError} />}
      <View style={styles.tabBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="今日待巡"
          onPress={() => setScreen('today')}
          style={styles.tab}
        >
          <Text
            style={[styles.tabText, screen === 'today' && styles.activeTab]}
          >
            今日待巡
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="我的"
          onPress={() => setScreen('profile')}
          style={styles.tab}
        >
          <Text
            style={[styles.tabText, screen === 'profile' && styles.activeTab]}
          >
            我的
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function MobileApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  const logout = useCallback(async () => {
    await clearAuthToken();
    setSession(null);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await getAuthToken();
      if (!token) {
        if (active) setHydrating(false);
        return;
      }
      try {
        const user = await api.me(token);
        if (active) setSession({ token, user });
      } catch (cause) {
        await clearAuthToken();
        if (!(cause instanceof ApiError && cause.status === 401) && active)
          setHydrationError(userFacingError(cause));
      }
      if (active) setHydrating(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (hydrating)
    return (
      <View style={styles.centered}>
        <Text style={styles.description}>正在恢复登录状态…</Text>
      </View>
    );
  return session ? (
    <AuthenticatedApp onLogout={() => void logout()} session={session} />
  ) : (
    <LoginScreen initialError={hydrationError} onLogin={setSession} />
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#f7f5f0' },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f7f5f0',
  },
  page: { padding: 24, paddingBottom: 120, gap: 16 },
  eyebrow: {
    color: '#7a6f62',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: { color: '#1c1917', fontSize: 38, fontWeight: '700', marginTop: 8 },
  heading: { color: '#1c1917', fontSize: 30, fontWeight: '700', marginTop: 6 },
  description: { color: '#57534e', fontSize: 16, lineHeight: 25, marginTop: 8 },
  form: { gap: 9, marginTop: 28, maxWidth: 460, width: '100%' },
  label: { color: '#57534e', fontSize: 13, fontWeight: '700', marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#d6d3d1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#1c1917',
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 13,
  },
  noteInput: {
    backgroundColor: '#fafaf9',
    borderColor: '#e7e2d8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#292524',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#1c1917',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
    marginTop: 9,
  },
  secondaryButton: { backgroundColor: '#e7e2d8' },
  dangerButton: { backgroundColor: '#a33b2f' },
  disabledButton: { opacity: 0.5 },
  pressedButton: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButtonText: { color: '#3d352e' },
  error: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    color: '#991b1b',
    lineHeight: 20,
    padding: 10,
  },
  success: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    color: '#166534',
    padding: 12,
  },
  warning: {
    backgroundColor: '#fff4d6',
    borderColor: '#e2b84b',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 13,
  },
  warningTitle: { color: '#855d00', fontWeight: '700' },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  link: { color: '#9a3412', fontSize: 15, fontWeight: '700', padding: 6 },
  card: {
    backgroundColor: '#fff',
    borderColor: '#e7e2d8',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  highlightedCard: { borderColor: '#d97706', borderWidth: 2 },
  cardEyebrow: { color: '#7a6f62', fontSize: 12, fontWeight: '700' },
  cardTitle: { color: '#292524', fontSize: 18, fontWeight: '700' },
  muted: { color: '#78716c', fontSize: 14, lineHeight: 20 },
  value: { color: '#292524', fontSize: 16, marginBottom: 4 },
  sectionTitle: {
    color: '#292524',
    fontSize: 19,
    fontWeight: '700',
    marginTop: 10,
  },
  empty: {
    borderColor: '#e7e2d8',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 20,
  },
  tabBar: {
    backgroundColor: '#fff',
    borderColor: '#e7e2d8',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    left: 0,
    paddingBottom: 18,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
  },
  tab: { alignItems: 'center', minWidth: 120, padding: 6 },
  tabText: { color: '#78716c', fontSize: 14, fontWeight: '700' },
  activeTab: { color: '#9a3412' },
  itemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  required: { color: '#9a3412', fontSize: 12, fontWeight: '700' },
  highlightText: { color: '#b45309', fontSize: 13, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8 },
});
