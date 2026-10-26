import { Redirect } from 'expo-router';
import { useSession } from '../components/mobile/session-provider';

export default function NotFound() {
  const { session } = useSession();
  return <Redirect href={session ? '/today' : '/'} />;
}
