import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ClipboardCheck,
  FileText,
  House,
  LayoutDashboard,
  LogOut,
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
  clearSession,
  getMe,
  readSession,
  unauthorizedEvent,
  type InspectionDetail,
  type Session,
  UnauthorizedError,
  writeSession,
} from '@/lib/api';
import { DashboardView } from '@/components/console/dashboard-view';
import { ErrorBanner } from '@/components/console/error-banner';
import { getErrorMessage } from '@/components/console/helpers';
import { roleLabel } from '@/components/console/labels';
import { QueueView } from '@/components/console/queue-view';
import { ReviewDetail } from '@/components/console/review-detail';

function useConsoleSession() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      setSession(null);
      void navigate({ to: '/' });
    };
    window.addEventListener(unauthorizedEvent, handleUnauthorized);
    return () =>
      window.removeEventListener(unauthorizedEvent, handleUnauthorized);
  }, [navigate]);
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
