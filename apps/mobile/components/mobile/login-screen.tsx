import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import type { Session } from './session';
import { classes, styles } from './styles';

export function LoginScreen({
  onLogin,
  initialError = null,
}: {
  onLogin: (session: Session) => void;
  initialError?: string | null;
}) {
  const [email, setEmail] = useState('inspector@northbean.example');
  const [password, setPassword] = useState('northbean-demo');
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.login(email.trim(), password);
      onLogin(response);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? '邮箱或密码错误。'
          : userFacingError(cause),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.centered}
      keyboardShouldPersistTaps="handled"
    >
      <Text className={classes.eyebrow} style={styles.eyebrow}>
        NORTHBEAN COFFEE · 店员端
      </Text>
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.title}
      >
        开始巡检
      </Text>
      <Text className={classes.muted} style={styles.description}>
        登录后查看今日任务、拍照并提交巡检结果。
      </Text>
      <View style={styles.form}>
        <Text className={classes.muted} style={styles.label}>
          邮箱
        </Text>
        <TextInput
          accessibilityLabel="邮箱"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          className={classes.input}
          style={styles.input}
          value={email}
        />
        <Text className={classes.muted} style={styles.label}>
          密码
        </Text>
        <TextInput
          accessibilityLabel="密码"
          onChangeText={setPassword}
          className={classes.input}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <ErrorBanner message={error} />
        <PrimaryButton
          disabled={loading}
          onPress={() => void submit()}
          testID="login-button"
        >
          {loading ? '登录中…' : '登录'}
        </PrimaryButton>
      </View>
    </ScrollView>
  );
}
