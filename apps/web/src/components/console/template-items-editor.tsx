import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
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
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
}) {
  const update = (key: string, patch: Partial<DraftItem>) =>
    onChange(
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold">检查项</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, newDraftItem()])}
        >
          <Plus aria-hidden="true" />
          添加检查项
        </Button>
      </div>
      <p id="photo-count-help" className="text-sm text-muted-foreground">
        最少照片张数为 0 时不拍照，提交时必须填写备注。
      </p>
      <ol className="divide-y">
        {items.map((item, index) => (
          <li key={item.key} className="space-y-3 py-4">
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
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`检查项 ${index + 1} 下移`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={items.length === 1}
                  onClick={() =>
                    onChange(items.filter((entry) => entry.key !== item.key))
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
