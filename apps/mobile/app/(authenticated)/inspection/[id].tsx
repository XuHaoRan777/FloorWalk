import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskDetailScreen } from '../../../components/mobile/task-detail-screen';
import { useSession } from '../../../components/mobile/session-provider';
import { useToday } from '../../../components/mobile/today-provider';

export default function InspectionPage() {
  const { id, position } = useLocalSearchParams<{
    id: string;
    position?: string;
  }>();
  const { session, expire } = useSession();
  const { loadToday } = useToday();
  const router = useRouter();
  if (!session) return null;
  return (
    <TaskDetailScreen
      key={id}
      id={id}
      focusPosition={position ? Number(position) : undefined}
      onUnauthorized={expire}
      onTaskUpdated={loadToday}
      onBack={() => router.dismissTo('/today')}
    />
  );
}
