import Stack from 'expo-router/stack';
import { styles } from '../../../../components/mobile/styles';

export const unstable_settings = {
  anchor: 'today',
};

export default function AdminTodayLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: styles.app }} />
  );
}
