import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, userFacingError } from '../../lib/api';
import { clearLegacyAuthToken } from '../../lib/storage';
import type { Session } from './session';

type SessionState = {
  session: Session | null;
  hydrating: boolean;
  hydrationError: string | null;
  logoutError: string | null;
  login: (session: Session) => void;
  logout: () => void;
  expire: () => void;
};
const SessionContext = createContext<SessionState | null>(null);
let startupSession: Promise<Session | null> | null = null;

function restoreSession() {
  if (!startupSession) {
    startupSession = (async () => {
      await clearLegacyAuthToken();
      try {
        return { user: await api.me() };
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) return null;
        throw cause;
      }
    })();
  }
  return startupSession;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const logout = useCallback(() => {
    setLogoutError(null);
    void api
      .logout()
      .then(() => setSession(null))
      .catch((cause: unknown) => setLogoutError(userFacingError(cause)));
  }, []);
  const expire = useCallback(() => setSession(null), []);

  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((restored) => {
        if (active && restored) setSession(restored);
      })
      .catch((cause: unknown) => {
        if (active) setHydrationError(userFacingError(cause));
      })
      .finally(() => {
        if (active) setHydrating(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        hydrating,
        hydrationError,
        logoutError,
        login: setSession,
        logout,
        expire,
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
