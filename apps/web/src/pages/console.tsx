import { useCallback, useEffect, useState } from 'react';
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
  ChevronUp,
  Settings2,
} from 'lucide-react';
import { APP_NAME, type CurrentUser } from '@libs/shared';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { getMe, readSession, type TaskReview } from '@/lib/api';
import type { Notification } from '@libs/shared';
import { DashboardView } from '@/components/console/dashboard-view';
import { TodayView } from '@/components/console/today-view';
import { ErrorBanner } from '@/components/console/error-banner';
import { roleLabel } from '@/components/console/labels';
import { BrandMark } from '@/components/brand-mark';
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const userId = session?.user.id;
  const handleUserChange = useCallback(
    (nextUser: CurrentUser) => {
      updateUser(nextUser);
      setAvatarUrl(nextUser.avatarUrl);
    },
    [updateUser],
  );
  const reviewQueue = useReviewQueue(
    !loading &&
      session?.user.role === 'admin' &&
      !session.user.mustChangePassword,
  );
  useEffect(() => {
    if (session?.user.role === 'admin') setSection('dashboard');
  }, [session?.user.role]);
  useEffect(() => {
    let active = true;
    if (userId) {
      void getMe()
        .then((currentUser) => {
          if (active) setAvatarUrl(currentUser.avatarUrl);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [userId]);
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
  const navigateSection = (nextSection: ConsoleSection) => {
    setSelectedNotification(null);
    setSelected(null);
    setSection(nextSection);
  };
  return (
    <SidebarProvider className="fw-console">
      <Sidebar variant="inset">
        <SidebarHeader>
          <Link
            to="/"
            className="flex items-center gap-2.5 px-3 py-3 text-base font-semibold"
          >
            <BrandMark size={28} className="shrink-0" />
            {APP_NAME}
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="控制台导航" className="flex min-h-full flex-col p-2">
            <SidebarMenu>
              {isAdmin && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'today'}
                      onClick={() => navigateSection('today')}
                    >
                      <CalendarDays aria-hidden="true" />
                      <span>今日视图</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'dashboard'}
                      onClick={() => navigateSection('dashboard')}
                    >
                      <LayoutDashboard aria-hidden="true" />
                      <span>总部看板</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'queue'}
                      onClick={() => navigateSection('queue')}
                    >
                      <ClipboardCheck aria-hidden="true" />
                      <span>审核队列</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <li className="fw-sidebar-divider" aria-hidden="true" />
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'sites'}
                      onClick={() => navigateSection('sites')}
                    >
                      <Store aria-hidden="true" />
                      <span>门店</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'templates'}
                      onClick={() => navigateSection('templates')}
                    >
                      <ClipboardList aria-hidden="true" />
                      <span>模板</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'site-schedules'}
                      onClick={() => navigateSection('site-schedules')}
                    >
                      <CalendarRange aria-hidden="true" />
                      <span>门店日程安排</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'schedules'}
                      onClick={() => navigateSection('schedules')}
                    >
                      <CalendarDays aria-hidden="true" />
                      <span>日程方案</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'standards'}
                      onClick={() => navigateSection('standards')}
                    >
                      <FileText aria-hidden="true" />
                      <span>AI 审核标准</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={section === 'users'}
                      onClick={() => navigateSection('users')}
                    >
                      <Users aria-hidden="true" />
                      <span>人员管理</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter className="fw-sidebar-footer">
          <details className="fw-sidebar-user">
            <summary
              aria-label={`账户菜单，${user.displayName}`}
              title={user.displayName}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" />
              ) : (
                <span className="fw-sidebar-user__avatar">
                  <UserRound aria-hidden="true" />
                </span>
              )}
              <span className="fw-sidebar-user__identity">
                <strong>{user.displayName}</strong>
                <small>{roleLabel[user.role]}</small>
              </span>
              <ChevronUp aria-hidden="true" />
            </summary>
            <div className="fw-sidebar-user__menu">
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget
                    .closest('details')
                    ?.removeAttribute('open');
                  navigateSection('profile');
                }}
              >
                <Settings2 aria-hidden="true" />
                账户设置
              </button>
              <button type="button" onClick={() => void logout()}>
                <LogOut aria-hidden="true" />
                退出登录
              </button>
            </div>
          </details>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="@container/content">
        <Header>
          <div className="ml-auto">
            <NotificationInbox onOpen={setSelectedNotification} />
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="fw-console-pending-button"
              title={reviewQueue.error || undefined}
              onClick={() => {
                navigateSection('queue');
                reviewQueue.refresh();
              }}
            >
              <ClipboardCheck aria-hidden="true" />
              <span className="fw-console-pending-label">
                待我处理{' '}
                {reviewQueue.error
                  ? '—'
                  : reviewQueue.loading
                    ? '…'
                    : reviewQueue.manualQueue.length}
              </span>
            </Button>
          )}
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
              <ProfilePage onUserChange={handleUserChange} />
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
