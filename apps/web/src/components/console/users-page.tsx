import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Plus, RotateCcw, UserRound } from 'lucide-react';
import type { AdminSite, AdminUser } from '@libs/shared';
import { Button } from '@/components/ui/button';
import { getAdminSites } from '@/lib/api/admin';
import {
  createAdminUser,
  getAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
} from '@/lib/api/users';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';
import { roleLabel } from './labels';

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loginName, setLoginName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [password, setPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingSiteId, setEditingSiteId] = useState('');

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
        loginName: loginName.trim(),
        displayName: displayName.trim(),
        role: 'store_manager',
        siteId,
        password,
      });
      setUsers((current) =>
        [...current, created].sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        ),
      );
      setLoginName('');
      setDisplayName('');
      setPassword('');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const saveUser = async (user: AdminUser) => {
    setBusy(true);
    setError('');
    try {
      const updated = await updateAdminUser(user.id, {
        displayName: editingName.trim(),
        ...(user.role === 'store_manager' ? { siteId: editingSiteId } : {}),
      });
      setUsers((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setEditingId(null);
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
    <section className="min-w-0 space-y-6">
      <div className="fw-page-heading flex-wrap">
        <div>
          <p className="fw-page-eyebrow">人员与权限</p>
          <h1>人员管理</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RotateCcw aria-hidden="true" />
          刷新
        </Button>
      </div>
      <ErrorBanner message={error} />
      <form
        onSubmit={create}
        className="grid min-w-0 gap-3 rounded-md border bg-card p-4 shadow-xs lg:grid-cols-2"
      >
        <label className="grid gap-1.5 text-sm font-medium">
          昵称
          <input
            className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          登录名（手机号或邮箱）
          <input
            className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          门店
          <select
            className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
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
        <label className="grid gap-1.5 text-sm font-medium">
          初始密码
          <input
            className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={busy || loading || !siteId}>
            <Plus aria-hidden="true" />
            创建店长
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
        <div className="min-w-0 overflow-x-auto rounded-md border bg-card shadow-xs">
          <table className="fw-data-table fw-users-table min-w-[48rem]">
            <thead>
              <tr>
                <th>昵称</th>
                <th>登录名</th>
                <th>角色</th>
                <th>门店</th>
                <th>状态</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium">
                    {editingId === user.id ? (
                      <input
                        aria-label={`昵称 ${user.loginName}`}
                        className="h-8 rounded-md border bg-background px-2"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                    ) : (
                      <span className="block max-w-48 break-all">
                        {user.displayName}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="block max-w-56 break-all">
                      {user.loginName}
                    </span>
                  </td>
                  <td>{roleLabel[user.role]}</td>
                  <td>
                    {editingId === user.id && user.role === 'store_manager' ? (
                      <select
                        aria-label={`门店 ${user.loginName}`}
                        className="h-8 min-w-0 rounded-md border bg-background px-2"
                        value={editingSiteId}
                        onChange={(event) =>
                          setEditingSiteId(event.target.value)
                        }
                      >
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.code} · {site.name}
                          </option>
                        ))}
                      </select>
                    ) : user.site ? (
                      <span className="block max-w-56 break-all">
                        {user.site.code} · {user.site.name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span
                      className="fw-dashboard-status whitespace-nowrap"
                      data-status={
                        user.disabled
                          ? 'failed'
                          : user.mustChangePassword
                            ? 'rework'
                            : 'passed'
                      }
                    >
                      {user.disabled
                        ? '已停用'
                        : user.mustChangePassword
                          ? '待首次改密'
                          : '启用'}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-2">
                      {editingId === user.id ? (
                        <>
                          <Button
                            size="sm"
                            disabled={
                              busy ||
                              !editingName.trim() ||
                              (user.role === 'store_manager' && !editingSiteId)
                            }
                            onClick={() => void saveUser(user)}
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(user.id);
                            setEditingName(user.displayName);
                            setEditingSiteId(user.site?.id ?? '');
                          }}
                        >
                          编辑
                        </Button>
                      )}
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
