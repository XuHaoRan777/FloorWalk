import { FormEvent, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CircleAlert, KeyRound } from 'lucide-react';
import { ApiError, changePassword, readSession, writeSession } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const session = readSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    setError('');
    void changePassword({ currentPassword, newPassword })
      .then(() => {
        if (session)
          writeSession({
            ...session,
            user: { ...session.user, mustChangePassword: false },
          });
        void navigate({ to: '/console', replace: true });
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof ApiError
            ? reason.message
            : '修改密码失败，请重试。',
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 p-6 sm:p-8">
      <div className="fw-page-heading">
        <h1>修改密码</h1>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          当前密码
          <input
            autoComplete="current-password"
            className="h-10 rounded-md border bg-background px-3 font-normal"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          新密码
          <input
            autoComplete="new-password"
            className="h-10 rounded-md border bg-background px-3 font-normal"
            type="password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          确认新密码
          <input
            autoComplete="new-password"
            className="h-10 rounded-md border bg-background px-3 font-normal"
            type="password"
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        <Button type="submit" disabled={busy}>
          <KeyRound aria-hidden="true" />
          {busy ? '正在保存…' : '保存新密码'}
        </Button>
      </form>
    </main>
  );
}
