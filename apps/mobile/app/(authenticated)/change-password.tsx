import { useRouter } from 'expo-router';
import { ChangePasswordScreen } from '../../components/mobile/change-password-screen';

export default function ChangePasswordPage() {
  const router = useRouter();
  return <ChangePasswordScreen onBack={() => router.replace('/profile')} />;
}
