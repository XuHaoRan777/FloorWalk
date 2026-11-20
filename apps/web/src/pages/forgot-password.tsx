import { useEffect, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { AuthFrame } from '@/components/layout/auth-frame';
import { ErrorBanner } from '@/components/console/error-banner';
import { getErrorMessage } from '@/components/console/helpers';
import {
  requestPasswordRecoveryCode,
  resetPasswordRecovery,
  verifyPasswordRecoveryCode,
} from '@/lib/api/email';

type RecoveryOrganization = { id: string; name: string };
type RecoveryStep = 'request' | 'verify' | 'reset' | 'done';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<RecoveryStep>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [organizations, setOrganizations] = useState<RecoveryOrganization[]>(
    [],
  );
  const [orgId, setOrgId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cooldownEmail, setCooldownEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const currentEmail = email.trim();
  const coolingDown = cooldown > 0 && cooldownEmail === currentEmail;

  const requestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestPasswordRecoveryCode(currentEmail);
      setCooldownEmail(currentEmail);
      setCooldown(60);
      setNotice('如果该邮箱可接收验证码，请查看邮箱。');
      setStep('verify');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await verifyPasswordRecoveryCode({
        email: currentEmail,
        code,
      });
      setResetToken(result.resetToken);
      setOrganizations(result.organizations);
      setOrgId(
        result.organizations.length === 1 ? result.organizations[0].id : '',
      );
      setStep('reset');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPasswordRecovery({ resetToken, orgId, password });
      setResetToken('');
      setStep('done');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="找回管理员密码"
      description={<p>通过管理员邮箱验证码设置新密码。</p>}
    >
      <div className="grid gap-4">
        <ErrorBanner message={error} />

        {step === 'request' && (
          <form onSubmit={requestCode} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              管理员邮箱
              <input
                className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? '正在发送…' : '发送验证码'}
            </Button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={verifyCode} className="grid gap-4">
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
            <label className="grid gap-1.5 text-sm font-medium">
              验证码
              <input
                className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? '正在验证…' : '验证并继续'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || coolingDown}
              onClick={() => {
                setStep('request');
                setCode('');
              }}
            >
              {coolingDown
                ? `${cooldown} 秒后可重新发送`
                : '更换邮箱或重新发送'}
            </Button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={changePassword} className="grid gap-4">
            {organizations.length > 1 ? (
              <label className="grid gap-1.5 text-sm font-medium">
                选择商家
                <select
                  className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={orgId}
                  onChange={(event) => setOrgId(event.target.value)}
                  required
                >
                  <option value="">请选择商家</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">
                商家：{organizations[0]?.name}
              </p>
            )}
            <label className="grid gap-1.5 text-sm font-medium">
              新密码
              <input
                className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              确认新密码
              <input
                className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={busy || !orgId}>
              {busy ? '正在保存…' : '设置新密码'}
            </Button>
          </form>
        )}

        {step === 'done' && (
          <div className="grid gap-4">
            <p role="status" className="text-sm text-muted-foreground">
              密码已更新，请使用新密码登录。
            </p>
            <Button asChild>
              <Link to="/">返回登录</Link>
            </Button>
          </div>
        )}

        {step !== 'done' && (
          <Button variant="outline" asChild>
            <Link to="/">返回登录</Link>
          </Button>
        )}
      </div>
    </AuthFrame>
  );
}
