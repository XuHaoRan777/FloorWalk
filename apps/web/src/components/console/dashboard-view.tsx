import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck,
  LayoutDashboard,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react';
import { getDashboard, type DashboardSite } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';
import { statusLabel } from './labels';

export function DashboardView({ onQueue }: { onQueue: () => void }) {
  const [sites, setSites] = useState<
    Array<DashboardSite & { site: DashboardSite['site'] & { active: boolean } }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getDashboard()
      .then((result) =>
        setSites(
          result as Array<
            DashboardSite & {
              site: DashboardSite['site'] & { active: boolean };
            }
          >,
        ),
      )
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  return (
    <>
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">Northbean 连锁门店</p>
          <h1>总部看板</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onQueue}>
            <ClipboardCheck aria-hidden="true" />
            审核队列
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RotateCcw aria-hidden="true" />
            刷新
          </Button>
        </div>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="fw-state" role="status">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          正在加载门店数据…
        </p>
      ) : error && sites.length === 0 ? null : sites.length === 0 ? (
        <div className="fw-state">
          <LayoutDashboard aria-hidden="true" />
          <p>暂无门店数据</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="fw-data-table min-w-[38rem]">
            <thead>
              <tr>
                <th className="px-4 py-3 font-medium">门店</th>
                <th className="px-4 py-3 font-medium">最近分数</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((entry) => (
                <tr key={entry.site.id}>
                  <td>
                    <span className="font-medium">{entry.site.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {entry.site.code}
                    </span>
                  </td>
                  <td>
                    {entry.latestScore === null ? (
                      '暂无'
                    ) : (
                      <>
                        <span>{entry.latestScore}</span> 分
                      </>
                    )}
                  </td>
                  <td>
                    {entry.latestStatus
                      ? statusLabel[entry.latestStatus]
                      : '暂无记录'}
                    {!entry.site.active && (
                      <span className="ml-2 font-medium text-destructive">
                        已停用
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
