import { useCallback, useEffect, useState } from 'react';
import type { TaskReview } from '@libs/shared';
import { getTaskReviewQueue } from '@/lib/api';
import { getErrorMessage } from './helpers';

export function useReviewQueue(enabled: boolean) {
  const [queue, setQueue] = useState<TaskReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let latestRequest = 0;
    setLoading(true);
    async function load() {
      const requestId = ++latestRequest;
      try {
        const next = await getTaskReviewQueue();
        if (active && requestId === latestRequest) {
          setQueue(next);
          setError('');
        }
      } catch (reason) {
        if (active && requestId === latestRequest)
          setError(getErrorMessage(reason));
      } finally {
        if (active && requestId === latestRequest) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, revision]);

  const manualQueue = queue.filter((task) =>
    task.items.some(
      (item) => item.result === 'pending' && item.aiReviewStatus === 'manual',
    ),
  );
  const decidedToday = queue.filter((task) => task.decidedAt !== null);
  return { manualQueue, decidedToday, loading, error, refresh };
}
