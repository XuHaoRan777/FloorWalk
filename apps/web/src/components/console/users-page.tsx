import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Plus, RotateCcw, UserRound } from 'lucide-react';
import type { AdminSite, AdminUser, CreateUserRequest } from '@libs/shared';
import { Button } from '@/components/ui/button';
import { getAdminSites } from '@/lib/api/admin';
import {
  createAdminUser,
  getAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
} from '@/lib/api/users';
import { readSession } from '@/lib/api/session';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';
import { roleLabel } from './labels';

export function UsersPage() {
  const isAdmin = readSession()?.user.role === 'admin';
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<CreateUserRequest['role']>('inspector');
  const [siteId, setSiteId] = useState('');
  const [password, setPassword] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void Promise.all([getAdminUsers(), getAdminSites()])
      .then(([nextUsers, nextSites]) => {
        setUsers(nextUsers);
        setSites(nextSites);
        setSiteId((current) => current || nextSites[0]?.id || '');
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await createAdminUser({
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        ...(role === 'inspector' ? { siteId } : {}),
        password,
      });
      setUsers((current) =>
        [...current, created].sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        ),
      );
      setEmail('');
      setDisplayName('');
      setPassword('');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const toggleDisabled = async (user: AdminUser) => {
    const action = user.disabled ? '重新启用' : '停用';
    if (!window.confirm(`确定${action}「${user.displayName}」吗？`)) return;
    setBusy(true);
    setError('');
    try {
      const updated = await updateAdminUser(user.id, {
        disabled: !user.disabled,
      });
      setUsers((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (user: AdminUser) => {
    const nextPassword = window.prompt(
      `为 ${user.displayName} 设置初始密码（至少 8 位）`,
    );
    if (nextPassword === null) return;
    if (nextPassword.length < 8) {
      setError('新密码至少需要 8 位。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetAdminUserPassword(user.id, { password: nextPassword });
      setUsers((current) =>
        current.map((entry) =>
          entry.id === user.id ? { ...entry, mustChangePassword: true } : entry,
        ),
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="fw-page-heading flex-wrap">
        <div>
          <p className="fw-page-eyebrow">人员与权限</p>
          <h1>账号</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RotateCcw aria-hidden="true" />
          刷新
        </Button>
      </div>
      <ErrorBanner message={error} />
      <form
        onSubmit={create}
        className="grid gap-3 border-y py-4 lg:grid-cols-2"
      >
        <label className="grid gap-1.5 text-sm font-medium">
          姓名
          <input
            className="h-9 rounded-md border bg-background px-3 font-normal"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          邮箱
          <input
            className="h-9 rounded-md border bg-background px-3 font-normal"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          角色
          <select
            className="h-9 rounded-md border bg-background px-3 font-normal"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as CreateUserRequest['role'])
            }
          >
            <option value="inspector">店员</option>
            {isAdmin && <option value="supervisor">主管</option>}
            {isAdmin && <option value="admin">商家管理员</option>}
          </select>
        </label>
        {role === 'inspector' && (
          <label className="grid gap-1.5 text-sm font-medium">
            门店
            <select
              className="h-9 rounded-md border bg-background px-3 font-normal"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              required
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} · {site.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1.5 text-sm font-medium">
          初始密码
          <input
            className="h-9 rounded-md border bg-background px-3 font-normal"
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <div className="flex items-end">
          <Button
            type="submit"
            disabled={busy || loading || (role === 'inspector' && !siteId)}
          >
            <Plus aria-hidden="true" />
            创建账号
          </Button>
        </div>
      </form>
      {loading ? (
        <p className="fw-state" role="status">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          正在加载账号…
        </p>
      ) : users.length === 0 ? (
        <div className="fw-state">
          <UserRound aria-hidden="true" />
          <p>暂无账号</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="fw-data-table min-w-[48rem]">
            <thead>
              <tr>
                <th>姓名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>门店</th>
                <th>状态</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium">{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>{roleLabel[user.role]}</td>
                  <td>
                    {user.site ? `${user.site.code} · ${user.site.name}` : '—'}
                  </td>
                  <td>
                    {user.disabled ? (
                      <span className="text-destructive">已停用</span>
                    ) : user.mustChangePassword ? (
                      '待首次改密'
                    ) : (
                      '启用'
                    )}
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void resetPassword(user)}
                      >
                        重置密码
                      </Button>
                      <Button
                        size="sm"
                        variant={user.disabled ? 'outline' : 'destructive'}
                        disabled={busy}
                        onClick={() => void toggleDisabled(user)}
                      >
                        {user.disabled ? '重新启用' : '停用'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
