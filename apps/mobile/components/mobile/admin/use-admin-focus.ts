import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export function useAdminFocus(load: () => Promise<void>, poll = false) {
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = async () => {
        await load();
        if (poll && !cancelled)
          timer = setTimeout(() => void refresh(), 10_000);
      };
      void refresh();
      return () => {
        cancelled = true;
        if (timer !== undefined) clearTimeout(timer);
      };
    }, [load, poll]),
  );
}
