import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import type { TemplateItem } from '@libs/shared';
import { Button } from '@/components/ui/button';

export type DraftItem = Pick<
  TemplateItem,
  'title' | 'acceptanceCriteria' | 'critical'
> & { key: string; minPhotoCount: string };

export function newDraftItem(): DraftItem {
  return {
    key: crypto.randomUUID(),
    title: '',
    minPhotoCount: '0',
    acceptanceCriteria: '',
    critical: false,
  };
}

export function TemplateItemsEditor({
  items,
  onChange,
  onTransitionPendingChange,
}: {
  items: DraftItem[];
  onChange: Dispatch<SetStateAction<DraftItem[]>>;
  onTransitionPendingChange: (pending: boolean) => void;
}) {
  const applyStructuralChange = (
    updateItems: (currentItems: DraftItem[]) => DraftItem[],
  ) => {
    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => {
        updateCallbackDone: Promise<void>;
      };
    };
    if (
      !transitionDocument.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      onChange(updateItems);
      return;
    }

    flushSync(() => onTransitionPendingChange(true));
    const transition = transitionDocument.startViewTransition(() => {
      flushSync(() => onChange(updateItems));
    });
    const finishUpdate = () => onTransitionPendingChange(false);
    void transition.updateCallbackDone.then(finishUpdate, finishUpdate);
  };
  const update = (key: string, patch: Partial<DraftItem>) =>
    onChange((currentItems) =>
      currentItems.map((item) =>
        item.key === key ? { ...item, ...patch } : item,
      ),
    );
  const move = (key: string, direction: -1 | 1) => {
    applyStructuralChange((currentItems) => {
      const index = currentItems.findIndex((item) => item.key === key);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= currentItems.length) {
        return currentItems;
      }
      const next = [...currentItems];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };
  return (
    <div className="fw-template-items-editor">
      <div className="fw-template-items-heading">
        <h2 className="text-sm font-semibold">检查项</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const item = newDraftItem();
            applyStructuralChange((currentItems) => [...currentItems, item]);
          }}
        >
          <Plus aria-hidden="true" />
          添加检查项
        </Button>
      </div>
      <p id="photo-count-help" className="fw-template-items-help">
        最少照片张数为 0 时不拍照，提交时必须填写备注。
      </p>
      <ol className="fw-template-items">
        {items.map((item, index) => (
          <li key={item.key}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                检查项 {index + 1} 标题
                <input
                  className="h-9 min-w-0 rounded-md border bg-background px-3 font-normal"
                  required
                  value={item.title}
                  onChange={(event) =>
                    update(item.key, { title: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                <span>
                  <span className="sr-only">检查项 {index + 1} </span>
                  最少照片张数
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  step={1}
                  required
                  aria-describedby="photo-count-help"
                  className="h-9 w-32 rounded-md border bg-background px-3 font-normal"
                  value={item.minPhotoCount}
                  onChange={(event) =>
                    update(item.key, { minPhotoCount: event.target.value })
                  }
                />
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.critical}
                  onChange={(event) =>
                    update(item.key, { critical: event.target.checked })
                  }
                />
                严重项
              </label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`检查项 ${index + 1} 上移`}
                  disabled={index === 0}
                  onClick={() => move(item.key, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`检查项 ${index + 1} 下移`}
                  disabled={index === items.length - 1}
                  onClick={() => move(item.key, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={items.length === 1}
                  onClick={() =>
                    applyStructuralChange((currentItems) =>
                      currentItems.length === 1
                        ? currentItems
                        : currentItems.filter(
                            (entry) => entry.key !== item.key,
                          ),
                    )
                  }
                >
                  移除
                </Button>
              </div>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              <span>
                <span className="sr-only">检查项 {index + 1} </span>验收要点
              </span>
              <textarea
                rows={2}
                maxLength={500}
                className="w-full rounded-md border bg-background px-3 py-2 font-normal"
                value={item.acceptanceCriteria}
                onChange={(event) =>
                  update(item.key, { acceptanceCriteria: event.target.value })
                }
              />
            </label>
          </li>
        ))}
      </ol>
    </div>
  );
}
