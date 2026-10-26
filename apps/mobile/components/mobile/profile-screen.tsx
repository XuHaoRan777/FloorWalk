import { ScrollView, Text, View } from 'react-native';
import { PrimaryButton } from './primary-button';
import type { Session } from './session';
import { styles } from './styles';

export function ProfileScreen({
  session,
  siteName,
  onLogout,
}: {
  session: Session;
  siteName: string;
  onLogout: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>我的</Text>
      <Text accessibilityRole="header" style={styles.heading}>
        账号信息
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>姓名</Text>
        <Text style={styles.value}>{session.user.displayName}</Text>
        <Text style={styles.label}>邮箱</Text>
        <Text accessibilityLabel="当前邮箱" style={styles.value}>
          {session.user.email}
        </Text>
        <Text style={styles.label}>所属门店</Text>
        <Text accessibilityLabel="当前门店" style={styles.value}>
          {siteName || session.user.siteId || '未绑定门店'}
        </Text>
      </View>
      <PrimaryButton onPress={onLogout} variant="secondary">
        退出登录
      </PrimaryButton>
    </ScrollView>
  );
}
