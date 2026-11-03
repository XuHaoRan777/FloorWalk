import { useRouter } from 'expo-router';
import { ChangePasswordScreen } from '../../components/mobile/change-password-screen';
import { useSession } from '../../components/mobile/session-provider';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { session, login } = useSession();
  return (
    <ChangePasswordScreen
      onChanged={() => {
        if (session)
          login({
            ...session,
            user: { ...session.user, mustChangePassword: false },
          });
        router.replace('/today');
      }}
    />
  );
}
