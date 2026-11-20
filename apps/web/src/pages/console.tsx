import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ClipboardCheck,
  Store,
  ClipboardList,
  CalendarDays,
  CalendarRange,
  FileText,
  LayoutDashboard,
  LogOut,
  UserRound,
  Users,
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
import { readSession, type TaskReview } from '@/lib/api';
import type { Notification } from '@libs/shared';
import { DashboardView } from '@/components/console/dashboard-view';
import { TodayView } from '@/components/console/today-view';
import { ErrorBanner } from '@/components/console/error-banner';
import { roleLabel } from '@/components/console/labels';
import { QueueView } from '@/components/console/queue-view';
import { ReviewDetail } from '@/components/console/review-detail';
import { useReviewQueue } from '@/components/console/use-review-queue';
import { SitesPage } from '@/components/console/sites-page';
import { TemplatesPage } from '@/components/console/templates-page';
import { AiStandardsPage } from '@/components/console/ai-standards-page';
import { SchedulesPage } from '@/components/console/schedules-page';
import { SiteSchedulesPage } from '@/components/console/site-schedules-page';
import { UsersPage } from '@/components/console/users-page';
import { ProfilePage } from '@/components/console/profile-page';
import { NotificationInbox } from '@/components/console/notification-inbox';
import { NotificationTarget } from '@/components/console/notification-target';
import { useConsoleSession } from '@/components/console/use-console-session';

type ConsoleSection =
  | 'today'
  | 'queue'
  | 'dashboard'
  | 'sites'
  | 'templates'
  | 'standards'
  | 'schedules'
  | 'site-schedules'
  | 'users'
  | 'profile';

export function ConsolePage() {
  const navigate = useNavigate();
  const { session, loading, error, setError, logout, updateUser } =
    useConsoleSession();
  const [section, setSection] = useState<ConsoleSection>(() =>
    readSession()?.user.role === 'admin' ? 'dashboard' : 'queue',
  );
  const [selected, setSelected] = useState<TaskReview | null>(null);
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);
  const reviewQueue = useReviewQueue(
    !loading &&
      session?.user.role === 'admin' &&
      !session.user.mustChangePassword,
  );
  useEffect(() => {
    if (session?.user.role === 'admin') setSection('dashboard');
  }, [session?.user.role]);
  useEffect(() => {
    if (session?.user.mustChangePassword)
      void navigate({ to: '/change-password', replace: true });
  }, [navigate, session?.user.mustChangePassword]);
  if (loading || !session)
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground"
      >
        正在验证登录状态…
      </div>
    );
  const { user } = session;
  if (user.mustChangePassword) return null;
  const isAdmin = user.role === 'admin';
  return (
    <SidebarProvider className="fw-console">
      <Sidebar variant="inset">
        <SidebarHeader>
          <Link to="/" className="px-3 py-3 text-base font-semibold">
            {APP_NAME}
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="控制台导航" className="p-2">
            <SidebarMenu>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={section === 'today'}
                    onClick={() => {
                      setSection('today');
                      setSelected(null);
                    }}
                  >
                    <CalendarDays aria-hidden="true" />
                    <span>今日视图</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={section === 'queue'}
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
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isAdmin && section === 'dashboard'}
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
              {isAdmin && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'sites'}
                      onClick={() => {
                        setSection('sites');
                        setSelected(null);
                      }}
                    >
                      <Store aria-hidden="true" />
                      <span>门店</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'templates'}
                      onClick={() => {
                        setSection('templates');
                        setSelected(null);
                      }}
                    >
                      <ClipboardList aria-hidden="true" />
                      <span>模板</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'standards'}
                      onClick={() => {
                        setSection('standards');
                        setSelected(null);
                      }}
                    >
                      <FileText aria-hidden="true" />
                      <span>AI 审核标准</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'schedules'}
                      onClick={() => {
                        setSection('schedules');
                        setSelected(null);
                      }}
                    >
                      <CalendarDays aria-hidden="true" />
                      <span>日程方案</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'site-schedules'}
                      onClick={() => {
                        setSection('site-schedules');
                        setSelected(null);
                      }}
                    >
                      <CalendarRange aria-hidden="true" />
                      <span>门店日程安排</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'users'}
                      onClick={() => {
                        setSection('users');
                        setSelected(null);
                      }}
                    >
                      <Users aria-hidden="true" />
                      <span>账号</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={section === 'profile'}
                  onClick={() => {
                    setSection('profile');
                    setSelected(null);
                  }}
                >
                  <UserRound aria-hidden="true" />
                  <span>我的</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="@container/content">
        <Header>
          <span
            data-slot="console-identity"
            className="min-w-0 truncate whitespace-nowrap text-sm text-muted-foreground"
            title={`${roleLabel[user.role]} · ${user.displayName}`}
          >
            {roleLabel[user.role]} · {user.displayName}
          </span>
          <div className="ml-auto">
            <NotificationInbox onOpen={setSelectedNotification} />
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              title={reviewQueue.error || undefined}
              onClick={() => {
                setSection('queue');
                setSelected(null);
                reviewQueue.refresh();
              }}
            >
              <ClipboardCheck aria-hidden="true" />
              待我处理{' '}
              {reviewQueue.error
                ? '—'
                : reviewQueue.loading
                  ? '…'
                  : reviewQueue.manualQueue.length}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut aria-hidden="true" />
            退出登录
          </Button>
        </Header>
        <Main id="main">
          <div className="fw-console-sheet">
            <ErrorBanner message={error} />
            {selectedNotification ? (
              <NotificationTarget
                notification={selectedNotification}
                canReview={isAdmin}
                onBack={() => setSelectedNotification(null)}
                onReviewed={reviewQueue.refresh}
              />
            ) : section === 'profile' ? (
              <ProfilePage onUserChange={updateUser} onLogout={logout} />
            ) : isAdmin && section === 'sites' ? (
              <SitesPage />
            ) : isAdmin && section === 'templates' ? (
              <TemplatesPage />
            ) : isAdmin && section === 'standards' ? (
              <AiStandardsPage />
            ) : isAdmin && section === 'schedules' ? (
              <SchedulesPage />
            ) : isAdmin && section === 'site-schedules' ? (
              <SiteSchedulesPage />
            ) : isAdmin && section === 'users' ? (
              <UsersPage />
            ) : user.role === 'store_manager' ? (
              <div className="fw-inspector-notice mx-auto rounded-md border bg-card p-8 text-center">
                <FileText
                  className="mx-auto size-10 text-muted-foreground"
                  aria-hidden="true"
                />
                <h1 className="mt-4 text-2xl font-semibold">请使用手机端</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  店长巡检请在手机端完成，Web 端不提供操作页面。
                </p>
              </div>
            ) : selected ? (
              <ReviewDetail
                initialTask={selected}
                canReview={isAdmin}
                canSendChat={false}
                onBack={() => {
                  setSelected(null);
                  reviewQueue.refresh();
                }}
                onReviewed={reviewQueue.refresh}
              />
            ) : section === 'today' ? (
              <TodayView
                manualQueue={reviewQueue.manualQueue}
                queueLoading={reviewQueue.loading}
                queueError={reviewQueue.error}
                onRefreshQueue={reviewQueue.refresh}
                onSelect={(task) => {
                  setSelected(task);
                  setError('');
                }}
              />
            ) : isAdmin && section === 'dashboard' ? (
              <DashboardView onQueue={() => setSection('queue')} />
            ) : (
              <QueueView
                canReview={isAdmin}
                manualQueue={reviewQueue.manualQueue}
                decidedToday={reviewQueue.decidedToday}
                loading={reviewQueue.loading}
                error={reviewQueue.error}
                onRefresh={reviewQueue.refresh}
                onSelect={(task) => {
                  setSelected(task);
                  setError('');
                }}
              />
            )}
          </div>
        </Main>
      </SidebarInset>
    </SidebarProvider>
  );
}
