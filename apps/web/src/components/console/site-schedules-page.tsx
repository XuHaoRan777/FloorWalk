import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { AdminSchedule, AdminSiteSchedule } from '@libs/shared';
import { Button } from '@/components/ui/button';
import {
  addAdminSiteScheduleSkips,
  assignAdminSiteSchedule,
  deleteAdminSiteScheduleSkip,
  getAdminSchedules,
  getAdminSiteSchedules,
} from '@/lib/api/admin';
import { ConfirmDeleteDialog } from './confirm-delete-dialog';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';

type SkipToDelete = AdminSiteSchedule['skippedRanges'][number] & {
  siteName: string;
};

export function SiteSchedulesPage() {
  const [sites, setSites] = useState<AdminSiteSchedule[]>([]);
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scheduleId, setScheduleId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<SkipToDelete | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void Promise.all([getAdminSiteSchedules(), getAdminSchedules()])
      .then(([allSites, allSchedules]) => {
        setSites(allSites);
        setSchedules(allSchedules);
        setSelectedIds([]);
        setScheduleId('');
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  const assign = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSites(
        await assignAdminSiteSchedule({
          siteIds: selectedIds,
          scheduleId: scheduleId || null,
        }),
      );
      setNotice(`已为 ${selectedIds.length} 家门店更新方案。`);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const addSkips = async () => {
    if (!startsOn || !endsOn || startsOn > endsOn) {
      setError('请选择有效的起止日期，结束日期不能早于开始日期。');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSites(
        await addAdminSiteScheduleSkips({
          siteIds: selectedIds,
          startsOn,
          endsOn,
          note: note || null,
        }),
      );
      setNotice(`已为 ${selectedIds.length} 家门店添加跳过日期。`);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const removeSkip = async () => {
    if (!deleting) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await deleteAdminSiteScheduleSkip(deleting.id);
      setSites((all) =>
        all.map((site) => ({
          ...site,
          skippedRanges: site.skippedRanges.filter(
            (range) => range.id !== deleting.id,
          ),
        })),
      );
      setDeleting(null);
      setNotice('跳过日期区间已删除。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-5" aria-busy={loading || busy}>
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">巡检配置</p>
          <h1 className="text-balance">门店日程安排</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || busy}
          onClick={load}
        >
          <RotateCcw aria-hidden="true" />
          刷新
        </Button>
      </div>
      <ErrorBanner message={error} />
      <p role="status" className="text-sm text-muted-foreground">
        {busy ? '正在更新门店安排…' : notice}
      </p>
      {loading ? (
        <p role="status" className="fw-state">
          正在加载门店安排…
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground tabular-nums">
            已选择 {selectedIds.length} 家门店。先勾选下方门店，再批量设置。
          </p>
          <fieldset
            disabled={busy || !selectedIds.length}
            className="grid gap-6 border-y py-4 lg:grid-cols-2"
          >
            <form
              className="space-y-3"
              aria-label="批量选用方案"
              onSubmit={(event) => {
                event.preventDefault();
                void assign();
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium">
                选用方案
                <select
                  className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
                  value={scheduleId}
                  onChange={(event) => setScheduleId(event.target.value)}
                >
                  <option value="">不选用方案</option>
                  {schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </select>
              </label>
              {!schedules.length && (
                <p className="text-sm text-muted-foreground">
                  暂无方案，请先到「日程方案」页创建。
                </p>
              )}
              <Button type="submit" size="sm">
                应用方案
              </Button>
            </form>
            <form
              className="space-y-3"
              aria-label="批量添加跳过日期"
              onSubmit={(event) => {
                event.preventDefault();
                void addSkips();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  跳过开始日期
                  <input
                    type="date"
                    required
                    className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal tabular-nums"
                    value={startsOn}
                    onChange={(event) => setStartsOn(event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  跳过结束日期
                  <input
                    type="date"
                    required
                    min={startsOn || undefined}
                    className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal tabular-nums"
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                跳过备注（可选）
                <input
                  className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <p className="text-pretty text-xs text-muted-foreground">
                日期含起止两天，可只选一天；重叠区间会分别保留。
              </p>
              <Button type="submit" size="sm">
                添加跳过日期
              </Button>
            </form>
          </fieldset>
          {!sites.length ? (
            <p className="fw-state">暂无门店，请先到「门店」页创建。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">门店与日程安排</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-3">
                      <input
                        type="checkbox"
                        aria-label="选择全部门店"
                        disabled={busy}
                        checked={
                          sites.length > 0 &&
                          selectedIds.length === sites.length
                        }
                        onChange={(event) =>
                          setSelectedIds(
                            event.target.checked
                              ? sites.map((site) => site.siteId)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th className="px-3 py-3 font-medium">门店</th>
                    <th className="px-3 py-3 font-medium">所选方案</th>
                    <th className="px-3 py-3 font-medium">跳过区间</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.siteId} className="border-b align-top">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`选择门店 ${site.siteCode}`}
                          disabled={busy}
                          checked={selectedIds.includes(site.siteId)}
                          onChange={(event) =>
                            setSelectedIds((all) =>
                              event.target.checked
                                ? [...all, site.siteId]
                                : all.filter((id) => id !== site.siteId),
                            )
                          }
                        />
                      </td>
                      <td className="p-3">
                        <span className="font-medium">{site.siteName}</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {site.siteCode}
                          {!site.active && ' · 已停用'}
                        </p>
                      </td>
                      <td className="p-3">
                        {site.scheduleName ?? '未选用方案'}
                      </td>
                      <td className="p-3">
                        {!site.skippedRanges.length ? (
                          <span className="text-muted-foreground">
                            无跳过区间
                          </span>
                        ) : (
                          <ul className="space-y-3">
                            {site.skippedRanges.map((range) => (
                              <li
                                key={range.id}
                                className="flex items-start justify-between gap-3"
                              >
                                <div>
                                  <span className="whitespace-nowrap tabular-nums">
                                    {range.startsOn} 至 {range.endsOn}
                                  </span>
                                  {range.note && (
                                    <p className="mt-1 text-pretty text-xs text-muted-foreground">
                                      {range.note}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  aria-label={`删除 ${site.siteCode} 的跳过区间 ${range.startsOn} 至 ${range.endsOn}`}
                                  onClick={() => {
                                    setError('');
                                    setDeleting({
                                      ...range,
                                      siteName: site.siteName,
                                    });
                                  }}
                                >
                                  删除
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="删除跳过区间"
        description={
          deleting
            ? `确定删除「${deleting.siteName}」的 ${deleting.startsOn} 至 ${deleting.endsOn} 跳过区间吗？`
            : ''
        }
        busy={busy}
        error={error}
        onConfirm={removeSkip}
      />
    </section>
  );
}
