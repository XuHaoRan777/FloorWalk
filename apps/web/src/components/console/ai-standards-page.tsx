import { useCallback, useEffect, useState } from 'react';
import { FileText, LoaderCircle, Plus, RotateCcw, Save } from 'lucide-react';
import type { AiStandard } from '@libs/shared';
import { Button } from '@/components/ui/button';
import {
  createAdminAiStandard,
  getAdminAiStandards,
  updateAdminAiStandard,
} from '@/lib/api/admin';
import { ErrorBanner } from './error-banner';
import { getErrorMessage } from './helpers';

export function AiStandardsPage() {
  const [standards, setStandards] = useState<AiStandard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const select = useCallback((standard: AiStandard) => {
    setSelectedId(standard.id);
    setName(standard.name);
    setPrompt(standard.prompt);
    setIsNew(false);
    setError('');
    setNotice('');
  }, []);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getAdminAiStandards()
      .then((all) => {
        setStandards(all);
        if (all[0]) select(all[0]);
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [select]);
  useEffect(() => load(), [load]);
  const save = async () => {
    if (!name.trim()) {
      setError('请输入标准名称。');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = isNew
        ? await createAdminAiStandard({ name, prompt })
        : await updateAdminAiStandard(selectedId!, { name, prompt });
      setStandards((all) =>
        all.some((standard) => standard.id === saved.id)
          ? all.map((standard) => (standard.id === saved.id ? saved : standard))
          : [...all, saved],
      );
      select(saved);
      setNotice('审核标准已保存。');
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
          <h1>AI 审核标准</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || busy}
            onClick={load}
          >
            <RotateCcw aria-hidden="true" />
            刷新
          </Button>
          <Button
            size="sm"
            disabled={loading || busy}
            onClick={() => {
              setSelectedId(null);
              setName('');
              setPrompt('');
              setIsNew(true);
              setError('');
              setNotice('');
            }}
          >
            <Plus aria-hidden="true" />
            新建标准
          </Button>
        </div>
      </div>
      <div id="standard-error">
        <ErrorBanner message={error} />
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {busy ? '正在保存审核标准…' : notice}
      </p>
      {loading ? (
        <p role="status" className="fw-state">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          正在加载审核标准…
        </p>
      ) : (
        <>
          {standards.length === 0 && !isNew && !error && (
            <div className="fw-state">
              <FileText aria-hidden="true" />
              <p>暂无审核标准</p>
            </div>
          )}
          <ul className="divide-y border-b">
            {standards.map((standard) => (
              <li key={standard.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={selectedId === standard.id && !isNew}
                  onClick={() => select(standard)}
                  className="w-full px-3 py-3 text-left font-medium hover:bg-muted/50 aria-pressed:bg-muted/70 disabled:opacity-60"
                >
                  {standard.name}
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
              aria-describedby={error ? 'standard-error' : undefined}
            >
              <fieldset disabled={busy} className="space-y-5">
                <label className="grid gap-1.5 text-sm font-medium">
                  标准名称
                  <input
                    required
                    aria-invalid={Boolean(error && !name.trim())}
                    aria-describedby={error ? 'standard-error' : undefined}
                    className="h-9 rounded-md border bg-background px-3 font-normal"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  提示词
                  <textarea
                    rows={10}
                    required
                    maxLength={4000}
                    aria-describedby="standard-prompt-help"
                    className="w-full rounded-md border bg-background px-3 py-2 font-normal"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </label>
                <p
                  id="standard-prompt-help"
                  className="text-sm text-muted-foreground"
                >
                  填写 1～4000 字审核要求，模板可选用此标准。
                </p>
                <div className="flex gap-2 border-t pt-4">
                  <Button type="submit">
                    <Save aria-hidden="true" />
                    {isNew ? '创建标准' : '保存修改'}
                  </Button>
                  {isNew && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (standards[0]) select(standards[0]);
                        else {
                          setIsNew(false);
                          setSelectedId(null);
                        }
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}
