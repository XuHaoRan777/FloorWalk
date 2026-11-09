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
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(orgId?: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await api.login(email.trim(), password, orgId);
      if ('organizations' in response) {
        setOrganizations(response.organizations);
        return;
      }
      onLogin(response);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? '登录名或密码错误。'
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
        NORTHBEAN COFFEE · 店长端
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
          登录名
        </Text>
        <TextInput
          accessibilityLabel="登录名"
          autoCapitalize="none"
          onChangeText={(value) => {
            setEmail(value);
            setOrganizations([]);
          }}
          className={classes.input}
          style={styles.input}
          value={email}
        />
        <Text className={classes.muted} style={styles.label}>
          密码
        </Text>
        <TextInput
          accessibilityLabel="密码"
          onChangeText={(value) => {
            setPassword(value);
            setOrganizations([]);
          }}
          className={classes.input}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <ErrorBanner message={error} />
        {organizations.length > 0 ? (
          organizations.map((org) => (
            <PrimaryButton
              key={org.id}
              disabled={loading}
              onPress={() => void submit(org.id)}
              variant="secondary"
            >
              {org.name}
            </PrimaryButton>
          ))
        ) : (
          <PrimaryButton
            disabled={loading}
            onPress={() => void submit()}
            testID="login-button"
          >
            {loading ? '登录中…' : '登录'}
          </PrimaryButton>
        )}
      </View>
    </ScrollView>
  );
}
