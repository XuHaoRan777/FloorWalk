import { useRouter } from 'expo-router';
import { RecordsScreen } from '../../../components/mobile/records-screen';
import { useSession } from '../../../components/mobile/session-provider';
import { useToday } from '../../../components/mobile/today-provider';

export default function RecordsPage() {
  const router = useRouter();
  const { session, expire } = useSession();
  const { today } = useToday();
  if (!session) return null;
  return (
    <RecordsScreen
      siteName={today?.site.name ?? ''}
      managerName={session.user.displayName}
      onOpenRecord={(record) => {
        router.push({
          pathname: '/records/[id]',
          params: {
            id: record.id,
            templateName: record.templateName,
            ...(record.taskDate ? { taskDate: record.taskDate } : {}),
          },
        });
      }}
      onUnauthorized={expire}
    />
  );
}
