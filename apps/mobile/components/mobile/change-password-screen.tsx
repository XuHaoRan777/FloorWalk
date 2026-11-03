import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

export function ChangePasswordScreen({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (newPassword.length < 8) {
      setError('新密码至少需要 8 位。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? '当前密码错误。'
          : userFacingError(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
    >
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.heading}
      >
        修改密码
      </Text>
      <View style={styles.form}>
        <Text className={classes.muted} style={styles.label}>
          当前密码
        </Text>
        <TextInput
          accessibilityLabel="当前密码"
          autoComplete="current-password"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          className={classes.input}
          style={styles.input}
        />
        <Text className={classes.muted} style={styles.label}>
          新密码
        </Text>
        <TextInput
          accessibilityLabel="新密码"
          autoComplete="new-password"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          className={classes.input}
          style={styles.input}
        />
        <Text className={classes.muted} style={styles.label}>
          确认新密码
        </Text>
        <TextInput
          accessibilityLabel="确认新密码"
          autoComplete="new-password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          className={classes.input}
          style={styles.input}
        />
        <ErrorBanner message={error} />
        <PrimaryButton disabled={busy} onPress={() => void submit()}>
          {busy ? '保存中…' : '保存新密码'}
        </PrimaryButton>
      </View>
    </ScrollView>
  );
}
