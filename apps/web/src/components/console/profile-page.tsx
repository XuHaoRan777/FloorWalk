import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Camera, KeyRound, UserRound } from 'lucide-react';
import {
  avatarMimeTypes,
  maxAvatarSizeBytes,
  updateMeRequestSchema,
  type CurrentUser,
} from '@libs/shared';
import { Button } from '@/components/ui/button';
import { getMe, updateMe, uploadAvatar } from '@/lib/api/auth';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';
import { roleLabel } from './labels';

export function ProfilePage({
  onUserChange,
}: {
  onUserChange: (user: CurrentUser) => void;
}) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'name' | 'avatar' | null>(null);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [message, setMessage] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getMe()
      .then((next) => {
        if (!active) return;
        setUser(next);
        setDisplayName(next.displayName);
        onUserChange(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(getErrorMessage(reason));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [onUserChange]);

  const refreshUser = async () => {
    const next = await getMe();
    setUser(next);
    setDisplayName(next.displayName);
    onUserChange(next);
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    const input = updateMeRequestSchema.safeParse({ displayName });
    if (!input.success) {
      setNameError('昵称请输入 1～30 字。');
      return;
    }
    setNameError('');
    setBusy('name');
    try {
      await updateMe(input.data);
      await refreshUser();
      setMessage('昵称已保存。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return;
    setMessage('');
    setError('');
    setAvatarError('');
    if (!avatarMimeTypes.some((mime) => mime === file.type)) {
      setAvatarError('头像仅支持 JPEG 或 PNG 图片。');
      return;
    }
    if (file.size > maxAvatarSizeBytes) {
      setAvatarError('头像不能超过 2 MB。');
      return;
    }
    setBusy('avatar');
    try {
      await uploadAvatar(file);
      await refreshUser();
      setMessage('头像已更新。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="max-w-2xl min-w-0 space-y-6"
      aria-busy={loading || busy !== null}
    >
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">个人资料</p>
          <h1>账户设置</h1>
        </div>
      </div>
      <ErrorBanner message={error} />
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          正在加载个人资料…
        </p>
      ) : user ? (
        <>
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-y py-5">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="当前头像"
                className="size-20 rounded-full border object-cover"
              />
            ) : (
              <div
                className="flex size-20 items-center justify-center rounded-full border bg-muted text-muted-foreground"
                role="img"
                aria-label="尚未设置头像"
              >
                <UserRound className="size-8" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <input
                ref={imageInput}
                type="file"
                accept="image/jpeg,image/png"
                aria-label="选择头像"
                aria-describedby="profile-avatar-help profile-avatar-error"
                className="hidden"
                disabled={busy !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void changeAvatar(file);
                }}
              />
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => imageInput.current?.click()}
                aria-describedby="profile-avatar-help profile-avatar-error"
              >
                <Camera aria-hidden="true" />
                {busy === 'avatar' ? '正在上传…' : '改头像'}
              </Button>
              <p
                id="profile-avatar-help"
                className="text-xs text-muted-foreground"
              >
                JPEG 或 PNG 图片，最大 2 MB。
              </p>
              <p
                id="profile-avatar-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {avatarError}
              </p>
            </div>
          </div>
          {user.role === 'admin' ? (
            <form
              onSubmit={saveName}
              className="grid min-w-0 gap-3 rounded-md border bg-card p-4 shadow-xs"
            >
              <label className="grid gap-1.5 text-sm font-medium">
                昵称
                <input
                  className="h-10 min-w-0 rounded-md border bg-background px-3 font-normal"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setNameError('');
                  }}
                  minLength={1}
                  maxLength={30}
                  required
                  disabled={busy !== null}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby="profile-name-help profile-name-error"
                />
              </label>
              <p
                id="profile-name-help"
                className="text-xs text-muted-foreground"
              >
                昵称为 1～30 字。
              </p>
              <p
                id="profile-name-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {nameError}
              </p>
              <Button
                type="submit"
                className="justify-self-start"
                disabled={busy !== null}
              >
                {busy === 'name' ? '正在保存…' : '保存昵称'}
              </Button>
            </form>
          ) : (
            <dl className="grid min-w-0 gap-2 text-sm">
              <dt className="text-muted-foreground">昵称</dt>
              <dd className="break-all">{user.displayName}</dd>
            </dl>
          )}
          <dl className="grid min-w-0 gap-4 border-y py-5 text-sm sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <dt className="text-muted-foreground">登录名（只读）</dt>
              <dd className="break-all">{user.loginName}</dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className="text-muted-foreground">角色</dt>
              <dd>{roleLabel[user.role]}</dd>
            </div>
            {user.role === 'store_manager' && (
              <div className="min-w-0 space-y-1 sm:col-span-2">
                <dt className="text-muted-foreground">门店</dt>
                <dd className="break-all">
                  {user.site
                    ? `${user.site.code} · ${user.site.name}`
                    : '未分配门店'}
                </dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link to="/change-password">
                <KeyRound aria-hidden="true" />
                改密码
              </Link>
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
