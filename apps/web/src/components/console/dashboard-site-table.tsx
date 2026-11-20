import type {
  DashboardPeriodResponse,
  SelfCheckStatsResponse,
} from '@libs/shared';
import type { DashboardSite } from '@/lib/api';
import { percentage, scoreLabel } from './dashboard-format';
import { statusLabel } from './labels';

export function DashboardSiteTable({
  sites,
  checks,
  latestSites,
  showMetrics,
}: {
  sites: DashboardPeriodResponse['sites'];
  checks: Record<string, SelfCheckStatsResponse>;
  latestSites: Record<string, DashboardSite>;
  showMetrics: boolean;
}) {
  if (sites.length === 0) return null;
  return (
    <section aria-label="门店统计" className="fw-dashboard-table">
      <div className="overflow-x-auto">
        <table className="fw-data-table min-w-[38rem]">
          <thead>
            <tr>
              <th>门店</th>
              {showMetrics && (
                <>
                  <th className="text-right">完成率</th>
                  <th className="text-right">逾期</th>
                  <th className="text-right">自检准确率</th>
                  <th className="text-right">平均分</th>
                </>
              )}
              <th className="text-right">最近分数</th>
              <th>最近判定</th>
            </tr>
          </thead>
          <tbody>
            {sites.map(({ site, metrics }) => {
              const latest = latestSites[site.id];
              return (
                <tr key={site.id}>
                  <td>
                    <span className="font-medium">{site.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {site.code}
                    </span>
                    {!site.active && (
                      <span className="ml-2 text-destructive">已停用</span>
                    )}
                  </td>
                  {showMetrics && (
                    <>
                      <td className="text-right tabular-nums">
                        {percentage(metrics.completionRate)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {metrics.completed}/{metrics.expected}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {metrics.overdue}
                      </td>
                      <td className="text-right tabular-nums">
                        {percentage(checks[site.id]?.accuracy ?? null)}
                      </td>
                      <td className="text-right tabular-nums">
                        {scoreLabel(metrics.averageScore)}
                      </td>
                    </>
                  )}
                  <td className="text-right tabular-nums">
                    {latest?.latestScore == null
                      ? '暂无'
                      : scoreLabel(latest.latestScore)}
                  </td>
                  <td>
                    {latest?.latestStatus ? (
                      <span
                        className="fw-dashboard-status"
                        data-status={latest.latestStatus}
                      >
                        {statusLabel[latest.latestStatus]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">暂无记录</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
