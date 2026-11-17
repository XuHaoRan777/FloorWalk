import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  clearSession,
  clearLegacySession,
  deleteSession,
  checkSession,
  hasCheckedSession,
  readSession,
  unauthorizedEvent,
  type Session,
  type User,
  UnauthorizedError,
  writeSession,
} from '@/lib/api';
import { getErrorMessage } from './helpers';

export function useConsoleSession() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      setSession(null);
      void navigate({ to: '/' });
    };
    window.addEventListener(unauthorizedEvent, handleUnauthorized);
    return () =>
      window.removeEventListener(unauthorizedEvent, handleUnauthorized);
  }, [navigate]);
  useEffect(() => {
    clearLegacySession();
    const current = readSession();
    if (current) {
      setLoading(false);
      return;
    }
    if (hasCheckedSession()) {
      void navigate({ to: '/' });
      return;
    }
    let active = true;
    void checkSession()
      .then((next) => {
        if (!active) return;
        writeSession(next);
        setSession(next);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        clearSession();
        if (!(reason instanceof UnauthorizedError))
          setError(getErrorMessage(reason));
        void navigate({ to: '/' });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [navigate]);
  const logout = useCallback(async () => {
    try {
      await deleteSession();
      clearSession();
      setSession(null);
      void navigate({ to: '/' });
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }, [navigate]);
  const updateUser = useCallback((user: User) => {
    const next = { user };
    writeSession(next);
    setSession(next);
  }, []);
  return { session, loading, error, setError, logout, updateUser };
}
