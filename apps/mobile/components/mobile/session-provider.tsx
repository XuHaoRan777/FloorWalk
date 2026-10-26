import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, userFacingError } from '../../lib/api';
import { clearAuthToken, getAuthToken } from '../../lib/storage';
import type { Session } from './session';

type SessionState = {
  session: Session | null;
  hydrating: boolean;
  hydrationError: string | null;
  login: (session: Session) => void;
  logout: () => void;
};
const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
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

  const onLogout = useCallback(() => {
    void logout();
  }, [logout]);
  return (
    <SessionContext.Provider
      value={{
        session,
        hydrating,
        hydrationError,
        login: setSession,
        logout: onLogout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}
