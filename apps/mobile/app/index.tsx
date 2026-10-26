import { LoginScreen } from '../components/mobile/login-screen';
import { useSession } from '../components/mobile/session-provider';

export default function LoginPage() {
  const { hydrationError, login } = useSession();
  return <LoginScreen initialError={hydrationError} onLogin={login} />;
}
