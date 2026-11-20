import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, CircleAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthFrame } from '@/components/layout/auth-frame';
import {
  ApiError,
  clearLegacySession,
  checkSession,
  hasCheckedSession,
  login,
  readSession,
  writeSession,
} from '@/lib/api';

export function HomePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [orgId, setOrgId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(
    () => !hasCheckedSession(),
  );

  useEffect(() => {
    clearLegacySession();
    if (readSession()) {
      void navigate({ to: '/console' });
      return;
    }
    if (hasCheckedSession()) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    void checkSession()
      .then((session) => {
        if (!active) return;
        writeSession(session);
        void navigate({
          to: session.user.mustChangePassword ? '/change-password' : '/console',
        });
      })
      .catch(() => {
        if (!active) return;
        setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    void login(email.trim(), password, orgId || undefined)
      .then((session) => {
        if ('organizations' in session) {
          setOrganizations(session.organizations);
          setOrgId('');
          return;
        }
        writeSession(session);
        void navigate({
          to: session.user.mustChangePassword ? '/change-password' : '/console',
        });
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof ApiError
            ? reason.message
            : '登录失败，请稍后重试。',
        ),
      )
      .finally(() => setBusy(false));
  };

  if (checkingSession)
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground"
      >
        正在验证登录状态…
      </div>
    );

  return (
    <AuthFrame
      title="登录工作台"
      description={
        <>
          <p>让每一次巡检都有据可循。</p>
          <p>店长现场记录，商家管理员审核并掌握门店表现。</p>
          <p className="mt-4 flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden="true" />
            账号权限按角色分流
          </p>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">使用登录名和密码继续。</p>
        <form className="grid gap-4" onSubmit={onSubmit}>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          )}
          <div className="grid gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              登录名
            </label>
            <input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setOrganizations([]);
                setOrgId('');
              }}
              className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setOrganizations([]);
                setOrgId('');
              }}
              className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {organizations.length > 0 && (
            <label className="grid gap-2 text-sm font-medium">
              选择商家
              <select
                required
                value={orgId}
                onChange={(event) => setOrgId(event.target.value)}
                className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">请选择商家</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="submit" className="mt-2" disabled={busy}>
            {busy ? (
              '正在登录…'
            ) : (
              <>
                登录
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="link" className="px-0" asChild>
            <Link to="/register">注册商家</Link>
          </Button>
          <Button variant="link" className="px-0" asChild>
            <Link to="/forgot-password">忘记密码</Link>
          </Button>
        </div>
      </div>
    </AuthFrame>
  );
}
