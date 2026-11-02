import { ScrollView, Text, View } from 'react-native';
import { PrimaryButton } from './primary-button';
import { ErrorBanner } from './error-banner';
import type { Session } from './session';
import { classes, styles } from './styles';

export function ProfileScreen({
  session,
  siteName,
  onLogout,
  logoutError,
}: {
  session: Session;
  siteName: string;
  onLogout: () => void;
  logoutError?: string | null;
}) {
  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
    >
      <Text className={classes.eyebrow} style={styles.eyebrow}>
        我的
      </Text>
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.heading}
      >
        账号信息
      </Text>
      <View className={classes.card} style={styles.card}>
        <Text className={classes.muted} style={styles.label}>
          姓名
        </Text>
        <Text className={classes.foreground} style={styles.value}>
          {session.user.displayName}
        </Text>
        <Text className={classes.muted} style={styles.label}>
          邮箱
        </Text>
        <Text
          accessibilityLabel="当前邮箱"
          className={classes.foreground}
          style={styles.value}
        >
          {session.user.email}
        </Text>
        <Text className={classes.muted} style={styles.label}>
          所属门店
        </Text>
        <Text
          accessibilityLabel="当前门店"
          className={classes.foreground}
          style={styles.value}
        >
          {siteName || session.user.siteId || '未绑定门店'}
        </Text>
      </View>
      <ErrorBanner message={logoutError ?? null} />
      <PrimaryButton onPress={onLogout} variant="secondary">
        退出登录
      </PrimaryButton>
    </ScrollView>
  );
}
