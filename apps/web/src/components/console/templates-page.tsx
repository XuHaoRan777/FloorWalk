import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Star } from 'lucide-react';
import type { TemplateItem } from '@libs/shared';
import { Button } from '@/components/ui/button';
import {
  createAdminTemplate,
  getAdminTemplates,
  setCurrentAdminTemplate,
  updateAdminTemplate,
  type AdminTemplate,
} from '@/lib/api/admin';
import { getErrorMessage } from './helpers';
import { ErrorBanner } from './error-banner';

type DraftItem = Pick<TemplateItem, 'title' | 'photoRequired' | 'critical'> & {
  key: string;
};

function draftItems(template: AdminTemplate): DraftItem[] {
  return template.items.map((item) => ({
    key: item.id,
    title: item.title,
    photoRequired: item.photoRequired,
    critical: item.critical,
  }));
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initialized = useRef(false);
  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [selectedId, templates],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void getAdminTemplates()
      .then((result) => {
        setTemplates(result);
        if (!initialized.current && result[0]) {
          initialized.current = true;
          setSelectedId(result[0].id);
          setName(result[0].name);
          setItems(draftItems(result[0]));
        }
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const select = (template: AdminTemplate) => {
    setSelectedId(template.id);
    setName(template.name);
    setItems(draftItems(template));
    setIsNew(false);
    setError('');
  };

  const startNew = () => {
    setSelectedId(null);
    setName('');
    setItems([
      {
        key: crypto.randomUUID(),
        title: '',
        photoRequired: false,
        critical: false,
      },
    ]);
    setIsNew(true);
    setError('');
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) {
      setError('请输入模板名称。');
      return;
    }
    if (items.length === 0 || items.some((item) => !item.title.trim())) {
      setError('至少保留一个检查项，并填写检查项标题。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = isNew
        ? await createAdminTemplate({
            name,
            items: items.map(({ title, photoRequired, critical }) => ({
              title,
              photoRequired,
              critical,
            })),
          })
        : await updateAdminTemplate(selectedId!, {
            name,
            items: items.map(({ title, photoRequired, critical }, index) => ({
              position: index + 1,
              title,
              photoRequired,
              critical,
            })),
          });
      setTemplates((current) => {
        const exists = current.some((template) => template.id === saved.id);
        return exists
          ? current.map((template) =>
              template.id === saved.id ? saved : template,
            )
          : [...current, saved];
      });
      setSelectedId(saved.id);
      setName(saved.name);
      setItems(draftItems(saved));
      setIsNew(false);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const setCurrent = async () => {
    if (!selected || selected.isCurrent) return;
    setBusy(true);
    setError('');
    try {
      const current = await setCurrentAdminTemplate(selected.id);
      setTemplates((all) =>
        all.map((template) => ({
          ...template,
          isCurrent: template.id === current.id,
        })),
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">巡检配置</p>
          <h1 className="mt-1 text-2xl font-semibold">模板</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RotateCcw aria-hidden="true" />
            刷新
          </Button>
          <Button size="sm" onClick={startNew}>
            <Plus aria-hidden="true" />
            新建模板
          </Button>
        </div>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          正在加载模板…
        </p>
      ) : (
        <>
          <div className="divide-y border-y">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                aria-pressed={selectedId === template.id && !isNew}
                onClick={() => select(template)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 text-left hover:bg-muted/50 aria-pressed:bg-muted/70"
              >
                <span className="min-w-0 flex-1 font-medium">
                  {template.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {template.items.length} 项
                </span>
                {template.isCurrent && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Star className="size-3" aria-hidden="true" />
                    当前模板
                  </span>
                )}
              </button>
            ))}
          </div>
          {templates.length === 0 && !isNew && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无模板
            </p>
          )}
          {(selected || isNew) && (
            <div className="space-y-5 pt-1">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid min-w-64 flex-1 gap-1.5 text-sm font-medium">
                  模板名称
                  <input
                    className="h-9 rounded-md border bg-background px-3 font-normal"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                {selected?.isCurrent && (
                  <span className="pb-2 text-sm font-medium text-amber-700">
                    当前模板
                  </span>
                )}
                {selected && !selected.isCurrent && (
                  <Button
                    variant="outline"
                    onClick={() => void setCurrent()}
                    disabled={busy}
                  >
                    <Star aria-hidden="true" />
                    设为当前
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <h2 className="text-sm font-semibold">检查项</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setItems((current) => [
                        ...current,
                        {
                          key: crypto.randomUUID(),
                          title: '',
                          photoRequired: false,
                          critical: false,
                        },
                      ])
                    }
                  >
                    <Plus aria-hidden="true" />
                    添加检查项
                  </Button>
                </div>
                <ol className="divide-y">
                  {items.map((item, index) => (
                    <li
                      key={item.key}
                      className="grid gap-3 py-3 lg:grid-cols-[2.5rem_minmax(10rem,1fr)_auto_auto_auto] lg:items-center"
                    >
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <input
                        aria-label={`检查项 ${index + 1} 标题`}
                        className="h-9 min-w-0 rounded-md border bg-background px-3"
                        value={item.title}
                        onChange={(event) =>
                          setItems((all) =>
                            all.map((entry) =>
                              entry.key === item.key
                                ? { ...entry, title: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.photoRequired}
                          onChange={(event) =>
                            setItems((all) =>
                              all.map((entry) =>
                                entry.key === item.key
                                  ? {
                                      ...entry,
                                      photoRequired: event.target.checked,
                                    }
                                  : entry,
                              ),
                            )
                          }
                        />
                        必拍
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.critical}
                          onChange={(event) =>
                            setItems((all) =>
                              all.map((entry) =>
                                entry.key === item.key
                                  ? { ...entry, critical: event.target.checked }
                                  : entry,
                              ),
                            )
                          }
                        />
                        严重项
                      </label>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="上移"
                          aria-label={`检查项 ${index + 1} 上移`}
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="下移"
                          aria-label={`检查项 ${index + 1} 下移`}
                          onClick={() => move(index, 1)}
                          disabled={index === items.length - 1}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setItems((all) =>
                              all.filter((entry) => entry.key !== item.key),
                            )
                          }
                          disabled={items.length === 1}
                        >
                          移除
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button onClick={() => void save()} disabled={busy}>
                  <Save aria-hidden="true" />
                  {isNew ? '创建模板' : '保存修改'}
                </Button>
                {isNew && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsNew(false);
                      const first = templates[0];
                      if (first) select(first);
                      else {
                        setSelectedId(null);
                        setName('');
                        setItems([]);
                      }
                    }}
                  >
                    取消
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
