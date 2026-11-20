import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  error: string;
  onConfirm: () => Promise<void>;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-radix-dialog-overlay=""
          className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:duration-100 data-[state=open]:duration-100"
        />
        <Dialog.Content
          role="alertdialog"
          data-radix-dialog-content=""
          className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border bg-background p-6 shadow-lg"
          data-slot="confirm-delete-content"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancel.current?.focus();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <Dialog.Title className="text-balance text-lg font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-pretty text-sm text-muted-foreground">
            {description}
          </Dialog.Description>
          <ErrorBanner message={error} />
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button ref={cancel} variant="outline" disabled={busy}>
                取消
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {busy ? '正在删除…' : '确认删除'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
