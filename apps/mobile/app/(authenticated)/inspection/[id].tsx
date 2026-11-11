import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskDetailScreen } from '../../../components/mobile/task-detail-screen';
import { useSession } from '../../../components/mobile/session-provider';
import { useToday } from '../../../components/mobile/today-provider';

export default function InspectionPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, expire } = useSession();
  const { loadToday } = useToday();
  const router = useRouter();
  if (!session) return null;
  return (
    <TaskDetailScreen
      key={id}
      id={id}
      onUnauthorized={expire}
      onTaskUpdated={loadToday}
      onBack={() => router.dismissTo('/today')}
    />
  );
}
