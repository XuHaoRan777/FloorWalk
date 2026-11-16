import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import { ApiError, userFacingError } from '../../../lib/api';
import { useSession } from '../session-provider';

function adminError(cause: unknown) {
  if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500)
    return cause.status === 401 || cause.status === 403
      ? userFacingError(cause)
      : cause.message;
  return userFacingError(cause);
}

export function useAdminResource<T>(fetcher: () => Promise<T>, initial: T) {
  const { expire } = useSession();
  const [data, updateData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const setData = useCallback((value: SetStateAction<T>) => {
    // A completed write supersedes any refresh that started before it.
    generation.current += 1;
    updateData(value);
    setError(null);
    setLoading(false);
  }, []);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (request === generation.current) updateData(result);
    } catch (cause) {
      if (request !== generation.current) return;
      if (cause instanceof ApiError && cause.status === 401) expire();
      else setError(adminError(cause));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [expire, fetcher]);
  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  return { data, setData, loading, error, load };
}

export function useAdminAction() {
  const { expire } = useSession();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: () => Promise<void>, success: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expire();
      else setError(adminError(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return { busy, error, message, run };
}
