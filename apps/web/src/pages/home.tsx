import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, CircleAlert, ShieldCheck } from 'lucide-react';
import { APP_NAME } from '@libs/shared';
import { Button } from '@/components/ui/button';
import { ApiError, login, readSession, writeSession } from '@/lib/api';

export function HomePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readSession()) void navigate({ to: '/console' });
  }, [navigate]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    void login(email, password)
      .then((session) => {
        writeSession(session);
        void navigate({ to: '/console' });
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

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-lg font-semibold">{APP_NAME}</span>
          <span className="text-sm text-muted-foreground">门店巡检平台</span>
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.2fr_24rem]">
        <section>
          <p className="text-sm font-medium text-muted-foreground">
            连锁门店运营
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            让每一次巡检都有据可循。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            店员现场记录，主管审核，总部掌握每家门店的最近表现。
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" />
            账号权限按角色分流
          </div>
        </section>
        <section className="rounded-md border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">登录工作台</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              使用企业邮箱和密码继续。
            </p>
          </div>
          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
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
                邮箱
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
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
        </section>
      </main>
    </div>
  );
}
