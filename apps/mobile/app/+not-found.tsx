import { Redirect } from 'expo-router';
import { useSession } from '../components/mobile/session-provider';

export default function NotFound() {
  const { session } = useSession();
  const destination =
    session?.user.role === 'admin' ? '/admin/today' : session ? '/today' : '/';
  return <Redirect href={destination} />;
}
