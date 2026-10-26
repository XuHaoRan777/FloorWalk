import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TodayResponse } from '@libs/shared';
import { api, ApiError, userFacingError } from '../lib/api';
import { clearAuthToken, getAuthToken } from '../lib/storage';
import { ErrorBanner } from './mobile/error-banner';
import { InspectionScreen } from './mobile/inspection-screen';
import { LoginScreen } from './mobile/login-screen';
import { ProfileScreen } from './mobile/profile-screen';
import type { Session } from './mobile/session';
import { styles } from './mobile/styles';
import { TodayScreen } from './mobile/today-screen';

type Screen = 'today' | 'profile';

export function AuthenticatedApp({
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
