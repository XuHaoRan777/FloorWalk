import Stack from 'expo-router/stack';
import { styles } from '../../../components/mobile/styles';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: styles.app }} />
  );
}
