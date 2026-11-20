import { Plus, Trash2 } from 'lucide-react';
import type { ScheduleDay, ScheduleTask } from '@libs/shared';
import { Button } from '@/components/ui/button';
import type { AdminTemplate } from '@/lib/api/admin';

type DraftTask = ScheduleTask & { key: string };
export type DraftScheduleDay = Omit<ScheduleDay, 'tasks'> & {
  tasks: DraftTask[];
};
const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function draftDays(days?: ScheduleDay[]): DraftScheduleDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = days?.find((entry) => entry.weekday === index + 1);
    return {
      weekday: index + 1,
      enabled: day?.enabled ?? true,
      tasks: (day?.tasks ?? []).map((task) => ({
        ...task,
        key: crypto.randomUUID(),
      })),
    };
  });
}

export function ScheduleDaysEditor({
  days,
  templates,
  onChange,
}: {
  days: DraftScheduleDay[];
  templates: AdminTemplate[];
  onChange: (days: DraftScheduleDay[]) => void;
}) {
  const changeDay = (weekday: number, update: Partial<DraftScheduleDay>) =>
    onChange(
      days.map((day) =>
        day.weekday === weekday ? { ...day, ...update } : day,
      ),
    );
  const changeTask = (
    day: DraftScheduleDay,
    key: string,
    update: Partial<ScheduleTask>,
  ) =>
    changeDay(day.weekday, {
      tasks: day.tasks.map((task) =>
        task.key === key ? { ...task, ...update } : task,
      ),
    });
  return (
    <div className="divide-y border-y">
      {days.map((day) => {
        const label = weekdayNames[day.weekday - 1];
        return (
          <fieldset
            key={day.weekday}
            className="min-w-0 space-y-3 py-4"
            aria-label={label}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 font-medium">
                <span>{label}</span>
                <input
                  type="checkbox"
                  aria-label={`${label}启用`}
                  checked={day.enabled}
                  onChange={(event) =>
                    changeDay(day.weekday, { enabled: event.target.checked })
                  }
                />
                <span className="text-sm font-normal text-muted-foreground">
                  {day.enabled ? '已启用' : '已停用'}
                </span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!day.enabled || !templates.length}
                onClick={() =>
                  changeDay(day.weekday, {
                    tasks: [
                      ...day.tasks,
                      {
                        key: crypto.randomUUID(),
                        templateId: '',
                        startsAt: '',
                        endsAt: '',
                      },
                    ],
                  })
                }
              >
                <Plus aria-hidden="true" />
                添加任务
              </Button>
            </div>
            <fieldset disabled={!day.enabled} className="space-y-3">
              {day.tasks.map((task, index) => {
                const prefix = `${label}任务 ${index + 1}`;
                return (
                  <div
                    key={task.key}
                    className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 lg:items-end"
                  >
                    <label className="col-span-2 grid min-w-0 gap-1.5 text-sm lg:col-span-1">
                      模板
                      <select
                        aria-label={`${prefix}模板`}
                        required
                        className="h-9 min-w-0 rounded-md border bg-background px-2"
                        value={task.templateId}
                        onChange={(event) =>
                          changeTask(day, task.key, {
                            templateId: event.target.value,
                          })
                        }
                      >
                        <option value="">选择模板</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid min-w-0 gap-1.5 text-sm">
                      开始时刻
                      <input
                        type="time"
                        step={60}
                        required
                        aria-label={`${prefix}开始时刻`}
                        className="h-9 min-w-0 rounded-md border bg-background px-2 tabular-nums"
                        value={task.startsAt}
                        onChange={(event) =>
                          changeTask(day, task.key, {
                            startsAt: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="grid min-w-0 gap-1.5 text-sm">
                      结束时刻
                      <input
                        type="time"
                        step={60}
                        required
                        aria-label={`${prefix}结束时刻`}
                        className="h-9 min-w-0 rounded-md border bg-background px-2 tabular-nums"
                        value={task.endsAt}
                        onChange={(event) =>
                          changeTask(day, task.key, {
                            endsAt: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {task.startsAt &&
                        task.endsAt &&
                        task.endsAt <= task.startsAt
                          ? '次日结束'
                          : '当日结束'}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`移除${prefix}`}
                        onClick={() =>
                          changeDay(day.weekday, {
                            tasks: day.tasks.filter(
                              (entry) => entry.key !== task.key,
                            ),
                          })
                        }
                      >
                        <Trash2 aria-hidden="true" />
                        移除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </fieldset>
            {!day.tasks.length && (
              <p className="text-sm text-muted-foreground">
                {day.enabled ? '这天暂无任务。' : '这天不安排任务。'}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
