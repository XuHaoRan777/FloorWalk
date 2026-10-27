import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { TodayScreen } from '../../../components/mobile/today-screen';
import { useSession } from '../../../components/mobile/session-provider';
import { useToday } from '../../../components/mobile/today-provider';

export default function TodayPage() {
  const { session, expire } = useSession();
  const { today, loadToday } = useToday();
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void loadToday();
    }, [loadToday]),
  );
  if (!session) return null;
  return (
    <TodayScreen
      session={session}
      today={today}
      onRefresh={() => void loadToday()}
      onUnauthorized={expire}
      onOpenInspection={(id) =>
        router.push({ pathname: '/inspection/[id]', params: { id } })
      }
    />
  );
}
