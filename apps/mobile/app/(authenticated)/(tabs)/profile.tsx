import { ProfileScreen } from '../../../components/mobile/profile-screen';
import { useSession } from '../../../components/mobile/session-provider';
import { useToday } from '../../../components/mobile/today-provider';

export default function ProfilePage() {
  const { session, logout, logoutError } = useSession();
  const { today } = useToday();
  if (!session) return null;
  return (
    <ProfileScreen
      session={session}
      logoutError={logoutError}
      onLogout={logout}
      siteName={today?.site.name ?? ''}
    />
  );
}
