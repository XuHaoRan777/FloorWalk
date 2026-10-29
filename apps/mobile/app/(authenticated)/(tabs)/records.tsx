import { useRouter } from 'expo-router';
import { RecordsScreen } from '../../../components/mobile/records-screen';
import { useSession } from '../../../components/mobile/session-provider';

export default function RecordsPage() {
  const router = useRouter();
  const { session, expire } = useSession();
  if (!session) return null;
  return (
    <RecordsScreen
      onOpenRecord={(id) =>
        router.push({ pathname: '/records/[id]', params: { id } })
      }
      onUnauthorized={expire}
    />
  );
}
