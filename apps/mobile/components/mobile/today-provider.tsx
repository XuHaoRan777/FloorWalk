import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { TodayResponse } from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { useSession } from './session-provider';

type TodayState = {
  today: TodayResponse | null;
  loadingError: string | null;
  loadToday: () => Promise<void>;
};
const TodayContext = createContext<TodayState | null>(null);
export function TodayProvider({ children }: { children: ReactNode }) {
  const { session, logout: onLogout } = useSession();
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const token = session?.token;
  const loadToday = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingError(null);
      setToday(await api.today(token));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onLogout();
      else setLoadingError(userFacingError(cause));
    }
  }, [onLogout, token]);
  useEffect(() => {
    void loadToday();
  }, [loadToday]);
  return (
    <TodayContext.Provider value={{ today, loadingError, loadToday }}>
      {children}
    </TodayContext.Provider>
  );
}
export function useToday() {
  const value = useContext(TodayContext);
  if (!value) throw new Error('TodayProvider is missing');
  return value;
}
