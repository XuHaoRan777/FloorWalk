import { useLocalSearchParams, useRouter } from 'expo-router';
import { InspectionScreen } from '../../../components/mobile/inspection-screen';
import { useSession } from '../../../components/mobile/session-provider';

export default function InspectionPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, logout } = useSession();
  const router = useRouter();
  if (!session) return null;
  return (
    <InspectionScreen
      key={id}
      id={id}
      session={session}
      onUnauthorized={logout}
      onBack={() => router.dismissTo('/today')}
    />
  );
}
