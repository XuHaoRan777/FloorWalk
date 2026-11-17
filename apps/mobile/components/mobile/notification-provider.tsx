import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { ApiError } from '../../lib/api';
import { getUnreadNotificationCount } from '../../lib/api/notifications';
import { useSession } from './session-provider';

type NotificationState = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  markReadLocally: (wasUnread: boolean) => void;
};

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session, expire } = useSession();
  const userId = session?.user.id;
  const [unreadCount, setUnreadCount] = useState(0);
  const countGeneration = useRef(0);
  const expireRef = useRef(expire);
  const previousAppState = useRef<AppStateStatus | null | undefined>(
    AppState.currentState as AppStateStatus | null | undefined,
  );
  expireRef.current = expire;

  const refreshUnreadCount = useCallback(async () => {
    const generation = ++countGeneration.current;
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    try {
      const { count } = await getUnreadNotificationCount();
      if (generation === countGeneration.current) setUnreadCount(count);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        expireRef.current();
    }
  }, [userId]);

  const markReadLocally = useCallback((wasUnread: boolean) => {
    if (wasUnread) {
      countGeneration.current += 1;
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
    return () => {
      countGeneration.current += 1;
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasAway = previousAppState.current !== 'active';
      previousAppState.current = nextState;
      if (wasAway && nextState === 'active') void refreshUnreadCount();
    });
    return () => subscription.remove();
  }, [refreshUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{ unreadCount, refreshUnreadCount, markReadLocally }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const state = useContext(NotificationContext);
  if (!state) throw new Error('NotificationProvider is missing');
  return state;
}
