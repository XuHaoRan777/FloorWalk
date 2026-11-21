import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { scheduleDefinitionSchema, type AdminSchedule } from '@libs/shared';
import { Button } from '@/components/ui/button';
import {
  createAdminSchedule,
  deleteAdminSchedule,
  getAdminSchedules,
  getAdminTemplates,
  updateAdminSchedule,
  type AdminTemplate,
} from '@/lib/api/admin';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import {
  draftDays,
  ScheduleDaysEditor,
  type DraftScheduleDay,
} from './schedule-days-editor';
import { ErrorBanner } from './error-banner';
import { EmptyIllustration } from './empty-illustration';
import { getErrorMessage } from './helpers';

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState<DraftScheduleDay[]>(() => draftDays());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const select = useCallback((schedule: AdminSchedule) => {
    setSelectedId(schedule.id);
    setName(schedule.name);
    setDays(draftDays(schedule.days));
    setIsNew(false);
    setError('');
    setNotice('');
  }, []);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void Promise.all([getAdminSchedules(), getAdminTemplates()])
      .then(([allSchedules, allTemplates]) => {
        setSchedules(allSchedules);
        setTemplates(allTemplates);
        if (allSchedules[0]) select(allSchedules[0]);
        else {
          setSelectedId(null);
          setIsNew(false);
        }
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [select]);
  useEffect(() => load(), [load]);

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setName('');
    setDays(draftDays());
    setError('');
    setNotice('');
  };
  const save = async () => {
    const parsed = scheduleDefinitionSchema.safeParse({ name, days });
    if (!parsed.success) {
      setError('请填写方案名称，并为每条任务选择模板、开始与结束时刻。');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = isNew
        ? await createAdminSchedule(parsed.data)
        : await updateAdminSchedule(selectedId!, parsed.data);
      setSchedules((all) =>
        all.some((schedule) => schedule.id === saved.id)
          ? all.map((schedule) => (schedule.id === saved.id ? saved : schedule))
          : [...all, saved],
      );
      select(saved);
      setNotice('日程方案已保存。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await deleteAdminSchedule(selectedId);
      const remaining = schedules.filter(
        (schedule) => schedule.id !== selectedId,
      );
      setSchedules(remaining);
      if (remaining[0]) select(remaining[0]);
      else {
        setSelectedId(null);
        setIsNew(false);
      }
      setDeleting(false);
      setNotice('日程方案已删除。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const selectedName =
    schedules.find((schedule) => schedule.id === selectedId)?.name ?? '';
  return (
    <section className="space-y-5" aria-busy={loading || busy}>
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">巡检配置</p>
          <h1 className="text-balance">日程方案</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading || busy}
          >
            <RotateCcw aria-hidden="true" />
            刷新
          </Button>
          <Button size="sm" onClick={startNew} disabled={loading || busy}>
            <Plus aria-hidden="true" />
            新建方案
          </Button>
        </div>
      </div>
      <div id="schedule-error">
        <ErrorBanner message={error} />
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {busy ? '正在保存日程配置…' : notice}
      </p>
      {loading ? (
        <p role="status" className="fw-state">
          正在加载日程方案…
        </p>
      ) : (
        <>
          {schedules.length === 0 && !isNew && !error && (
            <div className="fw-state fw-state--illustrated">
              <EmptyIllustration name="template" />
              <CalendarDays aria-hidden="true" />
              <p>暂无日程方案，点击「新建方案」开始配置。</p>
            </div>
          )}
          <ul className="divide-y border-b">
            {schedules.map((schedule) => (
              <li key={schedule.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={selectedId === schedule.id && !isNew}
                  onClick={() => select(schedule)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/50 aria-pressed:bg-muted/70 disabled:opacity-60"
                >
                  <span className="min-w-0 break-words font-medium">
                    {schedule.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {schedule.days.filter((day) => day.enabled).length} 天启用
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {(selectedId || isNew) && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              aria-describedby={error ? 'schedule-error' : undefined}
            >
              <fieldset disabled={busy} className="space-y-5">
                <label className="grid gap-1.5 text-sm font-medium">
                  方案名称
                  <input
                    className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <p className="text-pretty text-sm text-muted-foreground">
                  时刻按商家时区执行；结束不晚于开始时，表示次日结束。停用某天后，这天不安排任务。
                </p>
                {!templates.length && (
                  <p className="text-sm text-muted-foreground">
                    暂无模板，请先到「模板」页创建，再添加任务。
                  </p>
                )}
                <ScheduleDaysEditor
                  days={days}
                  templates={templates}
                  onChange={setDays}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">
                    <Save aria-hidden="true" />
                    {isNew ? '创建方案' : '保存修改'}
                  </Button>
                  {isNew ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (schedules[0]) select(schedules[0]);
                        else setIsNew(false);
                      }}
                    >
                      取消
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setError('');
                        setDeleting(true);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      删除方案
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="删除日程方案"
        description={`确定删除「${selectedName}」吗？被门店选用的方案不能删除。`}
        busy={busy}
        error={error}
        onConfirm={remove}
      />
    </section>
  );
}
