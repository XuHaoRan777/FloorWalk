import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, RotateCcw } from 'lucide-react';
import { getDashboard, type DashboardSite } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';
import { statusLabel } from './labels';

export function DashboardView({
  token,
  onQueue,
}: {
  token: string;
  onQueue: () => void;
}) {
  const [sites, setSites] = useState<DashboardSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getDashboard(token)
      .then(setSites)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => load(), [load]);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Northbean 连锁门店</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            总部看板
          </h1>
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
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          正在加载门店数据…
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">门店</th>
                <th className="px-4 py-3 font-medium">最近分数</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((entry) => (
                <tr key={entry.site.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{entry.site.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {entry.site.code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.latestScore === null ? (
                      '暂无'
                    ) : (
                      <>
                        <span>{entry.latestScore}</span> 分
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.latestStatus
                      ? statusLabel[entry.latestStatus]
                      : '暂无记录'}
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
