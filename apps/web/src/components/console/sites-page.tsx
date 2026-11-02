import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Plus, RotateCcw, Save, Store } from 'lucide-react';
import type { Site } from '@libs/shared';
import { Button } from '@/components/ui/button';
import {
  createAdminSite,
  getAdminSites,
  updateAdminSite,
} from '@/lib/api/admin';
import { getErrorMessage } from './helpers';
import { ErrorBanner } from './error-banner';

export function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getAdminSites()
      .then(setSites)
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await createAdminSite({ code, name });
      setSites((current) =>
        [...current, created].sort((a, b) => a.code.localeCompare(b.code)),
      );
      setCode('');
      setName('');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (site: Site) => {
    setBusy(true);
    setError('');
    try {
      const updated = await updateAdminSite(site.id, { name: editingName });
      setSites((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingId(null);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (site: Site) => {
    if (
      site.active &&
      !window.confirm(`确定停用「${site.name}」吗？店员将不能新建巡检。`)
    )
      return;
    setBusy(true);
    setError('');
    try {
      const updated = await updateAdminSite(site.id, { active: !site.active });
      setSites((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">门店配置</p>
          <h1>门店</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RotateCcw aria-hidden="true" />
          刷新
        </Button>
      </div>
      <ErrorBanner message={error} />
      <form
        onSubmit={create}
        className="grid gap-3 border-y py-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(12rem,1.3fr)_auto] sm:items-end"
      >
        <label className="grid gap-1.5 text-sm font-medium">
          门店编码
          <input
            className="h-9 rounded-md border bg-background px-3 font-normal"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          门店名称
          <input
            className="h-9 rounded-md border bg-background px-3 font-normal"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <Button type="submit" disabled={busy || !code.trim() || !name.trim()}>
          <Plus aria-hidden="true" />
          新建门店
        </Button>
      </form>
      {loading ? (
        <p className="fw-state" role="status">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          正在加载门店…
        </p>
      ) : error && sites.length === 0 ? null : sites.length === 0 ? (
        <div className="fw-state">
          <Store aria-hidden="true" />
          <p>暂无门店</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="fw-data-table min-w-[42rem]">
            <thead>
              <tr>
                <th className="px-3 py-2 font-medium">编码</th>
                <th className="px-3 py-2 font-medium">名称</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <td className="font-mono text-xs">{site.code}</td>
                  <td>
                    {editingId === site.id ? (
                      <input
                        aria-label={`门店名称 ${site.code}`}
                        className="h-8 w-full max-w-sm rounded-md border bg-background px-2"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                    ) : (
                      <span className="font-medium">{site.name}</span>
                    )}
                  </td>
                  <td>
                    {site.active ? (
                      <span className="text-success">启用</span>
                    ) : (
                      <span className="font-medium text-destructive">
                        已停用
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {editingId === site.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void saveName(site)}
                            disabled={busy || !editingName.trim()}
                          >
                            <Save aria-hidden="true" />
                            保存名称
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(site.id);
                            setEditingName(site.name);
                          }}
                        >
                          改名
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={site.active ? 'destructive' : 'outline'}
                        onClick={() => void toggleActive(site)}
                        disabled={busy}
                      >
                        {site.active ? '停用' : '重新启用'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
