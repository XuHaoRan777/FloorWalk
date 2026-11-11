import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { TodayScreen } from '../../../components/mobile/today-screen';
import { useSession } from '../../../components/mobile/session-provider';
import { useToday } from '../../../components/mobile/today-provider';

export default function TodayPage() {
  const { session } = useSession();
  const router = useRouter();
  const { today, loadingError, loadToday } = useToday();
  useFocusEffect(
    useCallback(() => {
      void loadToday();
    }, [loadToday]),
  );
  if (!session) return null;
  return (
    <TodayScreen
      today={today}
      todayError={loadingError}
      onRefresh={() => void loadToday()}
      onOpenTask={(id) =>
        router.push({ pathname: '/inspection/[id]', params: { id } })
      }
    />
  );
}
