import { useRouter } from 'expo-router';
import { LoginScreen } from '../components/mobile/login-screen';
import { useSession } from '../components/mobile/session-provider';

export default function LoginPage() {
  const router = useRouter();
  const { hydrationError, login } = useSession();
  return (
    <LoginScreen
      initialError={hydrationError}
      onLogin={(session) => {
        login(session);
        if (session.user.role === 'admin' && !session.user.mustChangePassword)
          router.replace('/admin/today');
      }}
    />
  );
}
