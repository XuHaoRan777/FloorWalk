import { ProfileScreen } from '../../../components/mobile/profile-screen';
import { useSession } from '../../../components/mobile/session-provider';

export default function ProfilePage() {
  const { session, login, expire, logout, logoutError } = useSession();
  if (!session) return null;
  return (
    <ProfileScreen
      session={session}
      onProfileChange={login}
      onExpired={expire}
      logoutError={logoutError}
      onLogout={logout}
    />
  );
}
