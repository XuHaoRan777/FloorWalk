import { useSession } from '../../../components/mobile/session-provider';
import { AdminHomeScreen } from '../../../components/mobile/admin/admin-home-screen';

export default function AdminHomePage() {
  const { session } = useSession();
  if (!session) return null;
  return <AdminHomeScreen displayName={session.user.displayName} />;
}
