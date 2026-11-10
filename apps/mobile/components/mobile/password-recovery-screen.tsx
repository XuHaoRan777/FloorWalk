import { useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { emailSchema, loginNameSchema } from '@libs/shared';
import { api, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

type RecoveryStep = 'request' | 'verify' | 'organization' | 'password' | 'done';

export function PasswordRecoveryScreen() {
  const router = useRouter();
  const { loginName } = useLocalSearchParams<{ loginName?: string }>();
  const [email, setEmail] = useState(loginName ?? '');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [orgId, setOrgId] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<RecoveryStep>('request');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode() {
    if (!emailSchema.safeParse(email.trim()).success) {
      setError(
        loginNameSchema.safeParse(email.trim()).success
          ? '店长忘记密码，请联系商家管理员重置。'
          : '请输入管理员邮箱。',
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.requestPasswordRecoveryCode(email.trim());
      setMessage(response.message);
      setStep('verify');
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.verifyPasswordRecoveryCode(
        email.trim(),
        code.trim(),
      );
      setResetToken(response.resetToken);
      setOrganizations(response.organizations);
      if (response.organizations.length === 1) {
        setOrgId(response.organizations[0].id);
        setStep('password');
      } else {
        setStep('organization');
      }
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setLoading(true);
    setError(null);
    try {
      await api.resetPasswordRecovery({ resetToken, orgId, password });
      setStep('done');
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className={classes.background}
      contentContainerStyle={styles.centered}
      keyboardShouldPersistTaps="handled"
    >
      <Text className={classes.eyebrow} style={styles.eyebrow}>
        FLOORWALK · 管理员账号
      </Text>
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.heading}
      >
        {step === 'done' ? '密码已更新' : '找回密码'}
      </Text>
      <Text className={classes.muted} style={styles.description}>
        管理员可通过邮箱验证码重设密码。店长忘记密码，请联系商家管理员重置。
      </Text>

      <View style={styles.form}>
        {step === 'request' ? (
          <>
            <Text className={classes.muted} style={styles.label}>
              管理员邮箱或店长登录名
            </Text>
            <TextInput
              accessibilityLabel="管理员邮箱或店长登录名"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              className={classes.input}
              style={styles.input}
              testID="recovery-email"
              value={email}
            />
            <ErrorBanner message={error} />
            <PrimaryButton
              disabled={loading || !email.trim()}
              onPress={() => void requestCode()}
              testID="recovery-request-code"
            >
              {loading ? '正在发送…' : '发送验证码'}
            </PrimaryButton>
          </>
        ) : null}

        {step === 'verify' ? (
          <>
            <Text className={classes.muted} selectable>
              {email.trim()}
            </Text>
            <Text className={classes.muted} style={styles.description}>
              {message}
            </Text>
            <Text className={classes.muted} style={styles.label}>
              邮箱验证码
            </Text>
            <TextInput
              accessibilityLabel="邮箱验证码"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setCode}
              className={classes.input}
              style={styles.input}
              testID="recovery-code"
              value={code}
            />
            <ErrorBanner message={error} />
            <PrimaryButton
              disabled={loading || !/^\d{6}$/.test(code.trim())}
              onPress={() => void verifyCode()}
              testID="recovery-verify-code"
            >
              {loading ? '正在验证…' : '验证邮箱'}
            </PrimaryButton>
          </>
        ) : null}

        {step === 'organization' ? (
          <>
            <Text className={classes.muted} style={styles.description}>
              请选择要重设密码的商家。
            </Text>
            {organizations.map((organization) => (
              <PrimaryButton
                key={organization.id}
                disabled={loading}
                onPress={() => {
                  setOrgId(organization.id);
                  setStep('password');
                }}
                testID={`recovery-org-${organization.id}`}
                variant="secondary"
              >
                {organization.name}
              </PrimaryButton>
            ))}
            <ErrorBanner message={error} />
          </>
        ) : null}

        {step === 'password' ? (
          <>
            {organizations.length > 1 ? (
              <Text className={classes.muted}>
                {organizations.find((organization) => organization.id === orgId)
                  ?.name ?? ''}
              </Text>
            ) : null}
            <Text className={classes.muted} style={styles.label}>
              新密码
            </Text>
            <TextInput
              accessibilityLabel="新密码"
              autoComplete="new-password"
              onChangeText={setPassword}
              secureTextEntry
              className={classes.input}
              style={styles.input}
              testID="recovery-new-password"
              value={password}
            />
            <ErrorBanner message={error} />
            <PrimaryButton
              disabled={loading || password.length < 8 || !orgId}
              onPress={() => void resetPassword()}
              testID="recovery-reset-password"
            >
              {loading ? '正在更新…' : '更新密码'}
            </PrimaryButton>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <Text className={classes.muted}>你可以使用新密码重新登录。</Text>
            <PrimaryButton
              onPress={() => router.replace('/')}
              testID="recovery-return-login"
            >
              返回登录
            </PrimaryButton>
          </>
        ) : null}

        {step !== 'done' ? (
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="link"
              className={classes.link}
              style={styles.touchTarget}
              testID="recovery-back-login"
            >
              <Text className={classes.link} style={styles.link}>
                返回登录
              </Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </ScrollView>
  );
}
