import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/console/error-banner';
import { getErrorMessage } from '@/components/console/helpers';
import { createOrg } from '@/lib/api/orgs';
import { writeSession } from '@/lib/api/session';

export function RegisterPage() {
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await createOrg({ orgName, adminName, email, password });
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
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
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
          disabled={busy || !orgName.trim() || !adminName.trim()}
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
