import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
} from 'lucide-react';
import type { AiStandard, QuickSetupTemplateRequest } from '@libs/shared';
import { Button } from '@/components/ui/button';
import {
  createAdminTemplate,
  getAdminAiStandards,
  getAdminTemplates,
  quickSetupAdminTemplate,
  updateAdminTemplate,
  type AdminTemplate,
} from '@/lib/api/admin';
import { getErrorMessage } from './helpers';
import { ErrorBanner } from './error-banner';
import {
  newDraftItem,
  TemplateItemsEditor,
  type DraftItem,
} from './template-items-editor';

const quickOptions = [
  ['coffee', '咖啡店'],
  ['restaurant', '餐馆'],
  ['florist', '花店'],
] as const;

export function TemplatesPage() {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [standards, setStandards] = useState<AiStandard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiStandardId, setAiStandardId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [itemsUpdating, setItemsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const editingDisabled = busy || itemsUpdating;
  const select = useCallback((template: AdminTemplate) => {
    setSelectedId(template.id);
    setName(template.name);
    setAiEnabled(template.aiEnabled);
    setAiStandardId(template.aiStandardId ?? '');
    setItems(
      template.items.map((item) => ({
        ...item,
        key: item.id,
        minPhotoCount: String(item.minPhotoCount),
      })),
    );
    setIsNew(false);
    setError('');
    setNotice('');
  }, []);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void Promise.all([getAdminTemplates(), getAdminAiStandards()])
      .then(([allTemplates, allStandards]) => {
        setTemplates(allTemplates);
        setStandards(allStandards);
        if (allTemplates[0]) select(allTemplates[0]);
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [select]);
  useEffect(() => load(), [load]);

  const startNew = () => {
    setSelectedId(null);
    setName('');
    setAiEnabled(true);
    setAiStandardId('');
    setItems([newDraftItem()]);
    setIsNew(true);
    setError('');
    setNotice('');
  };
  const save = async () => {
    if (!name.trim() || items.some((item) => !item.title.trim())) {
      setError('请填写模板名称和检查项标题。');
      return;
    }
    if (aiEnabled && !aiStandardId) {
      setError('启用 AI 时必须选择审核标准。');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const input = {
        name,
        aiEnabled,
        aiStandardId: aiStandardId || null,
        items: items.map(
          ({ title, critical, minPhotoCount, acceptanceCriteria }, index) => ({
            position: index + 1,
            title,
            critical,
            minPhotoCount: Number(minPhotoCount),
            acceptanceCriteria,
          }),
        ),
      };
      const saved = isNew
        ? await createAdminTemplate(input)
        : await updateAdminTemplate(selectedId!, input);
      setTemplates((all) =>
        all.some((template) => template.id === saved.id)
          ? all.map((template) => (template.id === saved.id ? saved : template))
          : [...all, saved],
      );
      select(saved);
      setNotice('模板已保存。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const quickSetup = async (kind: QuickSetupTemplateRequest['kind']) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await quickSetupAdminTemplate({ kind });
      setTemplates((all) => [...all, result.template]);
      setStandards((all) => [...all, result.standard]);
      select(result.template);
      setNotice(
        `已生成模板「${result.template.name}」和审核标准「${result.standard.name}」。`,
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="fw-templates-page"
      aria-busy={editingDisabled || loading}
      aria-label="巡检模板编辑"
    >
      <div className="fw-page-heading">
        <div>
          <p className="fw-page-eyebrow">巡检配置</p>
          <h1>模板</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading || editingDisabled}
          >
            <RotateCcw aria-hidden="true" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={startNew}
            disabled={loading || editingDisabled}
          >
            <Plus aria-hidden="true" />
            新建模板
          </Button>
        </div>
      </div>
      <div className="fw-template-quick-config">
        <span className="fw-template-quick-config__label">
          <ClipboardList aria-hidden="true" />
          快捷配置
        </span>
        {quickOptions.map(([kind, label]) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            disabled={loading || editingDisabled}
            onClick={() => void quickSetup(kind)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div id="template-error">
        <ErrorBanner message={error} />
      </div>
      {(busy || notice) && (
        <p role="status" className="fw-template-notice" aria-live="polite">
          {busy ? '正在保存配置…' : notice}
        </p>
      )}
      {loading ? (
        <p className="fw-state" role="status">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          正在加载模板…
        </p>
      ) : (
        <div className="fw-template-workspace">
          <aside className="fw-template-list" aria-label="模板列表">
            <div className="fw-template-list__header">
              <h2>已有模板</h2>
              <span>{templates.length} 个</span>
            </div>
            {templates.length === 0 && !isNew && !error ? (
              <p className="fw-template-list__empty">
                暂无模板，可新建或使用快捷配置。
              </p>
            ) : (
              <div className="fw-template-list__items">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={editingDisabled}
                    aria-pressed={selectedId === template.id && !isNew}
                    onClick={() => select(template)}
                    className="fw-template-list__item"
                  >
                    <span>{template.name}</span>
                    <span>{template.items.length} 项</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
          {(selectedId || isNew) && (
            <div className="fw-template-editor">
              <form
                className="fw-template-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!editingDisabled) void save();
                }}
                aria-describedby={error ? 'template-error' : undefined}
              >
                <fieldset disabled={editingDisabled}>
                  <label className="grid gap-1.5 text-sm font-medium">
                    模板名称
                    <input
                      className="rounded-md border bg-background px-3 font-normal"
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <div className="fw-template-ai-settings">
                    <label className="fw-template-ai-toggle">
                      <input
                        type="checkbox"
                        checked={aiEnabled}
                        onChange={(event) => setAiEnabled(event.target.checked)}
                      />
                      启用 AI
                    </label>
                    <div className="grid gap-1.5 text-sm font-medium">
                      <label htmlFor="template-ai-standard">AI 审核标准</label>
                      <select
                        id="template-ai-standard"
                        className="w-full min-w-0 rounded-md border bg-background px-3 font-normal"
                        value={aiStandardId}
                        required={aiEnabled}
                        onChange={(event) =>
                          setAiStandardId(event.target.value)
                        }
                        aria-describedby="ai-standard-help"
                      >
                        <option value="">不选择标准</option>
                        {standards.map((standard) => (
                          <option key={standard.id} value={standard.id}>
                            {standard.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p id="ai-standard-help" className="fw-template-ai-help">
                    {standards.length
                      ? '启用 AI 时必须选择审核标准，关闭时可不选。'
                      : '暂无审核标准，请先到「AI 审核标准」创建，或使用上方快捷配置。'}
                  </p>
                  <TemplateItemsEditor
                    items={items}
                    onChange={setItems}
                    onTransitionPendingChange={setItemsUpdating}
                  />
                  <div className="fw-template-actions">
                    <Button type="submit">
                      <Save aria-hidden="true" />
                      {isNew ? '创建模板' : '保存修改'}
                    </Button>
                    {isNew && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (templates[0]) select(templates[0]);
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}
