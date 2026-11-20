import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import type { Notification } from '@libs/shared';
import { notificationSchema } from '@libs/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications';
import { getErrorMessage } from './helpers';

const labels: Record<Notification['type'], string> = {
  item_rework: '检查项被打回',
  inspection_decided: '巡检已判定',
  inspection_overridden: '巡检结论已改判',
  critical_item_failed: '严重项不合格',
  task_overdue: '巡检任务逾期',
  manual_review_needed: '有检查项待人工审核',
  chat_message: '巡检有新消息',
};

function describe(notification: Notification) {
  if (notification.type === 'item_rework')
    return `${notification.payload.position}. ${notification.payload.reason}`;
  if (notification.type === 'inspection_decided')
    return `${notification.payload.status === 'passed' ? '通过' : '不合格'} · ${notification.payload.score} 分`;
  if ('position' in notification.payload)
    return `第 ${notification.payload.position} 项`;
  return notification.type === 'task_overdue'
    ? '请查看逾期任务'
    : '打开巡检聊天';
}

export function NotificationInbox({
  onOpen,
}: {
  onOpen: (notification: Notification) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      setCount((await getUnreadNotificationCount()).count);
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }, []);

  const refreshList = useCallback(async () => {
    setBusy(true);
    try {
      const result = await getNotifications();
      setNotifications(result.notifications.slice(0, 20));
      setError('');
      await refreshCount();
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshCount]);

  useEffect(() => {
    if (open) void refreshList();
  }, [open, refreshList]);

  async function openNotification(notification: Notification) {
    if (busy) return;
    setBusy(true);
    try {
      if (!notification.readAt) await markNotificationRead(notification.id);
      const read = notificationSchema.parse({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      });
      setNotifications((current) =>
        current.map((item) => (item.id === read.id ? read : item)),
      );
      setCount((current) =>
        Math.max(0, current - (notification.readAt ? 0 : 1)),
      );
      setOpen(false);
      onOpen(read);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => ({ ...item, readAt })),
      );
      setCount(0);
      setError('');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`通知${count ? `，${count} 条未读` : ''}`}
        title="通知"
        onClick={() => setOpen(true)}
        className="relative"
      >
        <Bell aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] leading-5 text-destructive-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <SheetTitle>通知</SheetTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || count === 0}
                onClick={() => void markAllRead()}
              >
                <CheckCheck aria-hidden="true" />
                全部已读
              </Button>
            </div>
            <SheetDescription>最近 20 条</SheetDescription>
          </SheetHeader>
          <div aria-live="polite" className="px-4 pb-4">
            {error && (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {busy && (
              <p role="status" className="py-4 text-sm text-muted-foreground">
                正在更新…
              </p>
            )}
            {!busy && notifications.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无通知
              </p>
            )}
            <ul className="divide-y divide-border">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className="flex w-full min-w-0 gap-3 px-2 py-4 text-left hover:bg-muted/60 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void openNotification(notification)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-start justify-between gap-3">
                        <span className="min-w-0 break-all text-sm font-medium">
                          {labels[notification.type]}
                        </span>
                        <span
                          className="fw-dashboard-status shrink-0 whitespace-nowrap"
                          data-status={
                            notification.readAt ? 'draft' : 'submitted'
                          }
                        >
                          {notification.readAt ? '已读' : '未读'}
                        </span>
                      </span>
                      <span className="mt-1 block break-all text-sm text-muted-foreground">
                        {describe(notification)}
                      </span>
                      <time
                        className="mt-1 block text-xs text-muted-foreground"
                        dateTime={notification.createdAt}
                      >
                        {new Intl.DateTimeFormat('zh-CN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(notification.createdAt))}
                      </time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
