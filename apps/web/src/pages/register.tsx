import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/console/error-banner';
import { getErrorMessage } from '@/components/console/helpers';
import { createOrg } from '@/lib/api/orgs';
import { writeSession } from '@/lib/api/session';
import { requestRegistrationCode } from '@/lib/api/email';

export function RegisterPage() {
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeSentFor, setCodeSentFor] = useState('');
  const [cooldownEmail, setCooldownEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const currentEmail = email.trim();
  const coolingDown = cooldown > 0 && cooldownEmail === currentEmail;

  const sendCode = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestRegistrationCode(currentEmail);
      setCodeSentFor(currentEmail);
      setCooldownEmail(currentEmail);
      setCooldown(60);
      setNotice('如果该邮箱可接收验证码，请查看邮箱。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { user } = await createOrg({
        orgName,
        adminName,
        email: currentEmail,
        verificationCode,
        password,
      });
      writeSession({ user });
      await navigate({ to: '/console' });
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="fw-page-heading">
        <h1>注册商家</h1>
      </div>
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          商家名称
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            name="orgName"
            autoComplete="organization"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          管理员姓名
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            name="adminName"
            autoComplete="name"
            value={adminName}
            onChange={(event) => setAdminName(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          邮箱
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setVerificationCode('');
              setCodeSentFor('');
              setError('');
              setNotice('');
            }}
            required
          />
        </label>
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor="verificationCode">邮箱验证码</label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              id="verificationCode"
              className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              name="verificationCode"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              required
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || !currentEmail || coolingDown}
              onClick={() => void sendCode()}
              className="min-w-32 px-3"
            >
              {busy
                ? '正在发送…'
                : coolingDown
                  ? `${cooldown} 秒后重新发送`
                  : codeSentFor === currentEmail
                    ? '重新发送验证码'
                    : '发送验证码'}
            </Button>
          </div>
        </div>
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        <label className="grid gap-1.5 text-sm font-medium">
          密码
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <Button
          type="submit"
          disabled={
            busy ||
            !orgName.trim() ||
            !adminName.trim() ||
            codeSentFor !== currentEmail
          }
        >
          {busy ? '正在注册…' : '注册商家'}
        </Button>
      </form>
      <Button variant="outline" asChild>
        <Link to="/">返回登录</Link>
      </Button>
    </main>
  );
}
