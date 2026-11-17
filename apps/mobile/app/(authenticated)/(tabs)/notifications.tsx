import { NotificationInboxScreen } from '../../../components/mobile/notification-inbox-screen';
import { useSession } from '../../../components/mobile/session-provider';

export default function NotificationsPage() {
  const { session } = useSession();
  if (!session) return null;
  return <NotificationInboxScreen role={session.user.role} />;
}
