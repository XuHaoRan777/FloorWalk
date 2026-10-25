import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  ClipboardCheck,
  FileText,
  House,
  LayoutDashboard,
  LogOut,
  RotateCcw,
  X,
} from 'lucide-react';
import { APP_NAME } from '@libs/shared';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import {
  ApiError,
  clearSession,
  getDashboard,
  getEvidenceUrl,
  getMe,
  getReviewQueue,
  readSession,
  reviewInspection,
  type DashboardSite,
  type InspectionDetail,
  type Review,
  type Session,
  UnauthorizedError,
  writeSession,
} from '@/lib/api';

const roleLabel = {
  inspector: '店员',
  supervisor: '主管',
  hq: '总部',
} as const;
const statusLabel = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  passed: '已通过',
  rework: '已打回',
  failed: '不合格',
} as const;
const actionLabel = {
  start: '开始审核',
  approve: '通过',
  rework: '打回',
  fail: '判不合格',
} as const;

function formatTime(value: string | null) {
  if (!value) return '未提交';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
function getErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : '页面加载失败，请稍后重试。';
}
function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
function StatusPill({ status }: { status: InspectionDetail['status'] }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
      {statusLabel[status]}
    </span>
  );
}

function useConsoleSession() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const current = readSession();
    if (!current) {
      void navigate({ to: '/' });
      return;
    }
    let active = true;
    void getMe(current.token)
      .then((user) => {
        if (!active) return;
        const next = { token: current.token, user };
        writeSession(next);
        setSession(next);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof UnauthorizedError) {
          clearSession();
          void navigate({ to: '/' });
        } else setError(getErrorMessage(reason));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [navigate]);
  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    void navigate({ to: '/' });
  }, [navigate]);
  return { session, loading, error, setError, logout };
}

function QueueView({
  token,
  canReview,
  onSelect,
}: {
  token: string;
  canReview: boolean;
  onSelect: (inspection: InspectionDetail) => void;
}) {
  const [queue, setQueue] = useState<InspectionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getReviewQueue(token)
      .then(setQueue)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => load(), [load]);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">现场提交的巡检单</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            审核队列
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RotateCcw aria-hidden="true" />
          刷新队列
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          正在加载审核队列…
        </p>
      ) : queue.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          当前没有待审核巡检单。
        </p>
      ) : (
        <div className="grid gap-3">
          {queue.map((inspection) => (
            <button
              type="button"
              key={inspection.id}
              onClick={() => onSelect(inspection)}
              className="grid gap-3 rounded-md border bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <span>
                <span className="block font-medium">
                  {inspection.site.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {inspection.site.code} · 提交于{' '}
                  {formatTime(inspection.submittedAt)}
                </span>
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span>
                  {inspection.score === null ? (
                    '未评分'
                  ) : (
                    <>
                      <span>{inspection.score}</span> 分
                    </>
                  )}
                </span>
                <StatusPill status={inspection.status} />
              </span>
              <span className="text-sm text-muted-foreground">
                {canReview ? '查看并审核 →' : '查看详情 →'}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function EvidenceImage({
  token,
  evidence,
}: {
  token: string;
  evidence: InspectionDetail['items'][number]['evidence'][number];
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    void getEvidenceUrl(token, evidence.id)
      .then((result) => active && setUrl(result.url))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [evidence.id, token]);
  return (
    <div className="overflow-hidden rounded-md border bg-muted">
      <img
        src={url || undefined}
        alt="检查项现场照片"
        className="aspect-video w-full object-cover"
      />
    </div>
  );
}

function ReviewDetail({
  token,
  initialInspection,
  canReview,
  onBack,
}: {
  token: string;
  initialInspection: InspectionDetail;
  canReview: boolean;
  onBack: () => void;
}) {
  const [inspection, setInspection] = useState(initialInspection);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reworkPrompt, setReworkPrompt] = useState(false);
  const startedAtOpen = canReview && initialInspection.status === 'submitted';
  const criticalFailure = inspection.items.some(
    (item) => item.critical && item.result === 'fail',
  );
  useEffect(() => {
    if (!canReview || inspection.status !== 'submitted') return;
    setBusy(true);
    void reviewInspection(token, inspection.id, { action: 'start' })
      .then(setInspection)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setBusy(false));
  }, [canReview, inspection.id, inspection.status, token]);
  const submitReview = (action: Review['action']) => {
    if (action === 'rework' && selectedItems.length === 0) {
      setReworkPrompt(true);
      setError('打回时至少选择一个检查项。');
      return;
    }
    setBusy(true);
    setError('');
    void reviewInspection(token, inspection.id, {
      action,
      comment: comment.trim() || null,
      ...(action === 'rework' ? { reworkItemIds: selectedItems } : {}),
    })
      .then(setInspection)
      .then(() => setReworkPrompt(false))
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setBusy(false));
  };
  const toggleItem = (id: string) =>
    setSelectedItems((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-3 mb-3"
          >
            <ArrowLeft aria-hidden="true" />
            返回队列
          </Button>
          <p className="text-sm text-muted-foreground">
            {inspection.site.code}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {inspection.site.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={inspection.status} />
          <span className="text-2xl font-semibold">
            {inspection.score === null ? '—' : `${inspection.score} 分`}
          </span>
        </div>
      </div>
      <ErrorBanner message={error} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-3" aria-labelledby="items-heading">
          <div className="flex items-center justify-between">
            <h2 id="items-heading" className="text-lg font-semibold">
              检查项
            </h2>
            <span className="text-sm text-muted-foreground">
              提交于 {formatTime(inspection.submittedAt)}
            </span>
          </div>
          {inspection.items.map((item) => (
            <article key={item.id} className="rounded-md border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.critical ? '严重项 · ' : ''}
                    {item.photoRequired ? '需要照片' : '无需照片'}
                  </p>
                </div>
                <span className="text-sm font-medium">
                  {item.result === 'pass'
                    ? '通过'
                    : item.result === 'fail'
                      ? '不通过'
                      : '未填写'}
                </span>
              </div>
              {item.note && (
                <p className="mt-3 rounded bg-muted p-3 text-sm">
                  备注：{item.note}
                </p>
              )}
              {canReview && reworkPrompt && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => toggleItem(item.id)}
                  />
                  选择为打回项
                </label>
              )}
              {item.evidence.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {item.evidence.map((evidence) => (
                    <EvidenceImage
                      key={evidence.id}
                      token={token}
                      evidence={evidence}
                    />
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
        <aside className="space-y-4">
          {canReview && (
            <section className="rounded-md border bg-card p-4">
              <h2 className="font-semibold">审核决定</h2>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="填写审核意见（可选）"
                className="mt-3 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {criticalFailure && (
                <p className="mt-3 text-sm text-destructive">
                  存在严重项不合格，不能通过。
                </p>
              )}
              <div className="mt-4 grid gap-2">
                <Button
                  onClick={() => submitReview('approve')}
                  disabled={busy || criticalFailure}
                >
                  <Check aria-hidden="true" />
                  通过
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setReworkPrompt(true);
                    setError('打回时至少选择一个检查项。');
                  }}
                  disabled={busy}
                >
                  <RotateCcw aria-hidden="true" />
                  打回
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => submitReview('fail')}
                  disabled={busy}
                >
                  <X aria-hidden="true" />
                  判不合格
                </Button>
                {reworkPrompt && (
                  <Button
                    variant="secondary"
                    onClick={() => submitReview('rework')}
                    disabled={busy}
                  >
                    确认打回
                  </Button>
                )}
              </div>
            </section>
          )}
          <section className="rounded-md border bg-card p-4">
            <h2 className="font-semibold">审核历史</h2>
            <ol className="mt-3 space-y-3">
              {inspection.reviews.length === 0 ? (
                <li className="text-sm text-muted-foreground">
                  {startedAtOpen ? '开始审核（已自动提交）' : '暂无审核记录'}
                </li>
              ) : (
                inspection.reviews.map((review) => (
                  <li key={review.id} className="border-l-2 pl-3 text-sm">
                    <p className="font-medium">{actionLabel[review.action]}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(review.createdAt)}
                    </p>
                    {review.comment && (
                      <p className="mt-1 text-muted-foreground">
                        {review.comment}
                      </p>
                    )}
                  </li>
                ))
              )}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

function DashboardView({
  token,
  onQueue,
}: {
  token: string;
  onQueue: () => void;
}) {
  const [sites, setSites] = useState<DashboardSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getDashboard(token)
      .then(setSites)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => load(), [load]);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Northbean 连锁门店</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            总部看板
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onQueue}>
            <ClipboardCheck aria-hidden="true" />
            审核队列
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RotateCcw aria-hidden="true" />
            刷新
          </Button>
        </div>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          正在加载门店数据…
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">门店</th>
                <th className="px-4 py-3 font-medium">最近分数</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((entry) => (
                <tr key={entry.site.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{entry.site.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {entry.site.code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.latestScore === null ? (
                      '暂无'
                    ) : (
                      <>
                        <span>{entry.latestScore}</span> 分
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.latestStatus
                      ? statusLabel[entry.latestStatus]
                      : '暂无记录'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ConsolePage() {
  const { session, loading, error, setError, logout } = useConsoleSession();
  const [section, setSection] = useState<'queue' | 'dashboard'>(() =>
    readSession()?.user.role === 'hq' ? 'dashboard' : 'queue',
  );
  const [selected, setSelected] = useState<InspectionDetail | null>(null);
  if (loading || !session)
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        正在验证登录状态…
      </div>
    );
  const { user, token } = session;
  const isHq = user.role === 'hq';
  const showDashboard = isHq && section === 'dashboard';
  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <Link to="/" className="px-2 py-3 text-lg font-semibold">
            {APP_NAME}
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="控制台导航" className="p-2">
            <SidebarMenu>
              {(user.role === 'supervisor' || user.role === 'hq') && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={!showDashboard}
                    onClick={() => {
                      setSection('queue');
                      setSelected(null);
                    }}
                  >
                    <ClipboardCheck aria-hidden="true" />
                    <span>审核队列</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isHq && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={showDashboard}
                    onClick={() => {
                      setSection('dashboard');
                      setSelected(null);
                    }}
                  >
                    <LayoutDashboard aria-hidden="true" />
                    <span>总部看板</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/">
                    <House aria-hidden="true" />
                    <span>返回登录</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="@container/content">
        <Header>
          <span className="text-sm text-muted-foreground">
            {roleLabel[user.role]} · {user.displayName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={logout}
          >
            <LogOut aria-hidden="true" />
            退出登录
          </Button>
        </Header>
        <Main id="main">
          <ErrorBanner message={error} />
          {user.role === 'inspector' ? (
            <div className="mx-auto max-w-xl rounded-md border bg-card p-8 text-center">
              <FileText
                className="mx-auto size-10 text-muted-foreground"
                aria-hidden="true"
              />
              <h1 className="mt-4 text-2xl font-semibold">请使用手机端</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                店员巡检请在手机端完成，Web 端不提供操作页面。
              </p>
            </div>
          ) : selected ? (
            <ReviewDetail
              token={token}
              initialInspection={selected}
              canReview={user.role === 'supervisor'}
              onBack={() => setSelected(null)}
            />
          ) : showDashboard ? (
            <DashboardView token={token} onQueue={() => setSection('queue')} />
          ) : (
            <QueueView
              token={token}
              canReview={user.role === 'supervisor'}
              onSelect={(inspection) => {
                setSelected(inspection);
                setError('');
              }}
            />
          )}
        </Main>
      </SidebarInset>
    </SidebarProvider>
  );
}
