import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  RotateCcw,
} from 'lucide-react';
import type { AdminTodayResponse, TaskReview } from '@libs/shared';
import { getAdminToday, getTaskReview } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';

const taskStatusLabel = {
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  overdue: '逾期',
};

const taskStatusTone = {
  not_started: 'draft',
  in_progress: 'in_review',
  submitted: 'submitted',
  overdue: 'failed',
} as const;

export function TodayView({
  manualQueue,
  queueLoading,
  queueError,
  onRefreshQueue,
  onSelect,
}: {
  manualQueue: TaskReview[];
  queueLoading: boolean;
  queueError: string;
  onRefreshQueue: () => void;
  onSelect: (task: TaskReview) => void;
}) {
  const [data, setData] = useState<AdminTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void getAdminToday()
      .then((result) => active && setData(result))
      .catch((reason: unknown) => active && setError(getErrorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [revision]);
  const openTask = async (id: string) => {
    setOpening(true);
    try {
      onSelect(await getTaskReview(id));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setOpening(false);
    }
  };
  const warnings =
    data?.tasks.filter(
      (task) => task.criticalFailure || task.status === 'overdue',
    ) ?? [];
  const time = (value: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: data?.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  return (
    <div className="fw-dashboard min-w-0">
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">{data?.date ?? '今日任务'}</p>
          <h1 className="text-balance">今日视图</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => {
            setRevision((value) => value + 1);
            onRefreshQueue();
          }}
        >
          <RotateCcw aria-hidden="true" />
          刷新今日视图
        </Button>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="fw-state" role="status">
          正在加载今日任务…
        </p>
      ) : (
        data && (
          <>
            <dl
              aria-label="今日汇总"
              className="grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-3"
            >
              {(
                [
                  {
                    label: '应完成',
                    value: data.summary.expected,
                    detail: '各店今日排定任务',
                    icon: ClipboardList,
                    tone: 'primary',
                  },
                  {
                    label: '已完成',
                    value: data.summary.completed,
                    detail: '按时交齐的任务',
                    icon: CheckCircle2,
                    tone: 'success',
                  },
                  {
                    label: '逾期',
                    value: data.summary.overdue,
                    detail: '已过截止时间',
                    icon: Clock3,
                    tone: 'warning',
                  },
                ] as const
              ).map(({ label, value, detail, icon: Icon, tone }) => (
                <div
                  key={label}
                  className={`fw-dashboard-metric fw-dashboard-metric--${tone}`}
                >
                  <dt>
                    <span className="fw-dashboard-metric__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span>{label}</span>
                  </dt>
                  <dd>{value}</dd>
                  <span className="fw-dashboard-metric__detail">{detail}</span>
                </div>
              ))}
            </dl>
            <section aria-label="警告" className="mb-6">
              <h2 className="fw-section-title mb-3">警告</h2>
              {warnings.length === 0 ? (
                <p className="text-sm text-muted-foreground">今日暂无警告</p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-md border bg-card">
                  {warnings.map((task) => (
                    <li
                      key={task.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 break-all">
                        {task.site.name} · {task.templateName} ·{' '}
                        <strong
                          className="fw-dashboard-status"
                          data-status="failed"
                        >
                          {[
                            task.criticalFailure && '严重项不合格',
                            task.status === 'overdue' && '任务逾期',
                          ]
                            .filter(Boolean)
                            .join('、')}
                        </strong>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={opening}
                        onClick={() => void openTask(task.id)}
                      >
                        查看任务
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="各店今日任务" className="min-w-0">
              <h2 className="fw-section-title mb-3">各店今日任务</h2>
              {data.tasks.length === 0 ? (
                <div className="fw-state">
                  <CalendarDays aria-hidden="true" />
                  <p>今日无任务</p>
                </div>
              ) : (
                <div className="fw-dashboard-table min-w-0">
                  <div className="overflow-x-auto">
                    <table className="fw-data-table min-w-[40rem]">
                      <thead>
                        <tr>
                          <th>门店</th>
                          <th>模板</th>
                          <th>时间窗</th>
                          <th>状态</th>
                          <th className="text-right">分数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tasks.map((task) => (
                          <tr key={task.id}>
                            <td className="max-w-56 break-all">
                              <span className="font-medium">
                                {task.site.name}
                              </span>
                              {!task.site.active && (
                                <span className="ml-2 text-muted-foreground">
                                  已停用
                                </span>
                              )}
                            </td>
                            <td className="max-w-56 break-all">
                              {task.templateName}
                            </td>
                            <td className="whitespace-nowrap">
                              {time(task.startsAt)}–{time(task.dueAt)}
                            </td>
                            <td>
                              <span
                                className="fw-dashboard-status whitespace-nowrap"
                                data-status={taskStatusTone[task.status]}
                              >
                                {taskStatusLabel[task.status]}
                              </span>
                            </td>
                            <td className="text-right tabular-nums">
                              {task.score === null ? '—' : `${task.score} 分`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )
      )}
      <section aria-label="待我处理" className="mt-6">
        <h2 className="fw-section-title mb-3">待我处理</h2>
        <ErrorBanner message={queueError} />
        {queueLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在加载待处理任务…
          </p>
        ) : manualQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无待人工审核任务</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {manualQueue.map((task) => (
              <li
                key={task.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span className="min-w-0 flex-1 break-all">
                  {task.site.name} · {task.templateName} · {task.taskDate}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelect(task)}
                >
                  处理任务
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
