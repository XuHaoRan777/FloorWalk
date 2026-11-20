import { useEffect, useState } from 'react';
import {
  ChartNoAxesCombined,
  CircleCheckBig,
  ClipboardCheck,
  Clock3,
  LayoutDashboard,
  RotateCcw,
  ScanLine,
} from 'lucide-react';
import type {
  DashboardPeriod,
  DashboardPeriodResponse,
  SelfCheckStatsResponse,
} from '@libs/shared';
import {
  getDashboard,
  getPeriodDashboard,
  getSelfCheckStats,
  type DashboardSite,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';
import { DashboardTrend } from './dashboard-trend';
import { DashboardSiteTable } from './dashboard-site-table';
import { percentage, scoreLabel } from './dashboard-format';

type DashboardData = {
  summary: DashboardPeriodResponse;
  siteChecks: Record<string, SelfCheckStatsResponse>;
  managerChecks: Record<string, SelfCheckStatsResponse>;
  latestSites: Record<string, DashboardSite>;
  accuracy: number | null;
  accuracySampleCount: number;
};

export function DashboardView({ onQueue }: { onQueue: () => void }) {
  const [period, setPeriod] = useState<DashboardPeriod>('week');
  const [dimension, setDimension] = useState<'site' | 'manager' | 'date'>(
    'site',
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    async function load() {
      try {
        const [summary, latestSites] = await Promise.all([
          getPeriodDashboard(period),
          getDashboard(),
        ]);
        const range = { from: summary.from, to: summary.to };
        const [sites, managers] = await Promise.all([
          Promise.all(
            summary.sites.map(
              async ({ site }) =>
                [
                  site.id,
                  await getSelfCheckStats({
                    scope: 'site',
                    id: site.id,
                    ...range,
                  }),
                ] as const,
            ),
          ),
          Promise.all(
            summary.managers.map(
              async (manager) =>
                [
                  manager.id,
                  await getSelfCheckStats({
                    scope: 'manager',
                    id: manager.id,
                    ...range,
                  }),
                ] as const,
            ),
          ),
        ]);
        const counts = sites.reduce(
          (total, [, stats]) => ({
            samples: total.samples + stats.sampleCount,
            matching: total.matching + stats.matchingCount,
          }),
          { samples: 0, matching: 0 },
        );
        if (active)
          setData({
            summary,
            siteChecks: Object.fromEntries(sites),
            managerChecks: Object.fromEntries(managers),
            latestSites: Object.fromEntries(
              latestSites.map((entry) => [entry.site.id, entry]),
            ),
            accuracy: counts.samples ? counts.matching / counts.samples : null,
            accuracySampleCount: counts.samples,
          });
      } catch (reason) {
        if (active) setError(getErrorMessage(reason));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [period, revision]);
  const periodLabel = period === 'week' ? '本周' : '本月';
  return (
    <div className="fw-dashboard">
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">门店巡检概况</p>
          <h1 className="text-balance">总部看板</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onQueue}>
            <ClipboardCheck aria-hidden="true" />
            审核队列
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCcw aria-hidden="true" />
            刷新看板
          </Button>
        </div>
      </div>
      <div className="fw-dashboard-toolbar">
        <div role="group" aria-label="统计周期" className="fw-dashboard-period">
          {(['week', 'month'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={period === value ? 'default' : 'outline'}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value === 'week' ? '本周' : '本月'}
            </Button>
          ))}
        </div>
        {!loading && !error && data && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {data.summary.from} 至 {data.summary.to} · {data.summary.timezone}
          </p>
        )}
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="fw-state" role="status">
          正在加载看板…
        </p>
      ) : error || !data ? null : data.summary.overall.expected === 0 ? (
        <>
          <div className="fw-state">
            <LayoutDashboard aria-hidden="true" />
            <p>{periodLabel}暂无数据</p>
          </div>
          <DashboardSiteTable
            sites={data.summary.sites}
            checks={data.siteChecks}
            latestSites={data.latestSites}
            showMetrics={false}
          />
        </>
      ) : (
        <>
          <dl aria-label="看板指标" className="fw-dashboard-metrics">
            {(
              [
                {
                  label: '完成率',
                  value: percentage(data.summary.overall.completionRate),
                  detail: `${data.summary.overall.completed} / ${data.summary.overall.expected} 项按时交齐`,
                  icon: CircleCheckBig,
                  tone: 'success',
                },
                {
                  label: '逾期任务',
                  value: String(data.summary.overall.overdue),
                  detail: '本周期已过截止时间',
                  icon: Clock3,
                  tone: 'warning',
                },
                {
                  label: '自检准确率',
                  value: percentage(data.accuracy),
                  detail: `${data.accuracySampleCount} 个判定样本`,
                  icon: ScanLine,
                  tone: 'accent',
                },
                {
                  label: '平均分',
                  value: scoreLabel(data.summary.overall.averageScore),
                  detail: '仅计已判定任务',
                  icon: ChartNoAxesCombined,
                  tone: 'primary',
                },
              ] as const
            ).map(({ label, value, detail, icon: Icon, tone }) => (
              <div
                key={`${label}-${value}`}
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
          <p className="fw-dashboard-summary">
            {periodLabel}应完成 {data.summary.overall.expected}{' '}
            项任务，截止前交齐 {data.summary.overall.completed}{' '}
            项。应完成数为本期已生成的任务；平均分仅计已判定任务。无样本以「—」显示。
          </p>
          <div
            role="group"
            aria-label="统计维度"
            className="fw-dashboard-dimensions"
          >
            {(
              [
                ['site', '门店'],
                ['manager', '店长排行榜'],
                ['date', '日期趋势'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={dimension === value ? 'default' : 'outline'}
                size="sm"
                aria-pressed={dimension === value}
                onClick={() => setDimension(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="fw-dashboard-dimension-content" key={dimension}>
            {dimension === 'site' ? (
              <DashboardSiteTable
                sites={data.summary.sites}
                checks={data.siteChecks}
                latestSites={data.latestSites}
                showMetrics
              />
            ) : dimension === 'manager' ? (
              <section aria-label="店长排行榜" className="fw-dashboard-table">
                <p className="fw-dashboard-table__note">
                  按提交条目数排序。提交数和通过率按当前上传人统计，通过率只计已判定条目；自检准确率归首次上传人。
                </p>
                {data.summary.managers.length === 0 ? (
                  <p className="fw-state">{periodLabel}暂无店长提交</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="fw-data-table min-w-[32rem]">
                      <thead>
                        <tr>
                          <th>排名</th>
                          <th>店长</th>
                          <th className="text-right">提交条目数</th>
                          <th className="text-right">通过率</th>
                          <th className="text-right">自检准确率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.summary.managers.map((manager, index) => (
                          <tr key={manager.id}>
                            <td className="tabular-nums">{index + 1}</td>
                            <td>{manager.displayName}</td>
                            <td className="text-right tabular-nums">
                              {manager.submittedItems}
                            </td>
                            <td className="text-right tabular-nums">
                              {percentage(manager.passRate)}
                            </td>
                            <td className="text-right tabular-nums">
                              {percentage(
                                data.managerChecks[manager.id]?.accuracy ??
                                  null,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : (
              <DashboardTrend dates={data.summary.dates} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
