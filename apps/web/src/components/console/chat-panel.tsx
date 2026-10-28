import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@libs/shared';
import { getChatMessages, sendChatMessage } from '@/lib/api/chat';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { formatTime, getErrorMessage } from './helpers';

export function ChatPanel({
  inspectionId,
  canSend,
}: {
  inspectionId: string;
  canSend: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getChatMessages(inspectionId)
      .then((response) => active && setMessages(response.messages))
      .catch((reason: unknown) => active && setError(getErrorMessage(reason)));
    return () => {
      active = false;
    };
  }, [inspectionId]);

  async function send() {
    if (busy || (!text.trim() && !file)) return;
    setBusy(true);
    setError('');
    try {
      const message = await sendChatMessage(inspectionId, {
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(file ? { file } : {}),
      });
      setMessages((current) => [...current, message]);
      setText('');
      setFile(null);
      if (imageInput.current) imageInput.current.value = '';
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label="巡检聊天">
      <h2 className="text-lg font-semibold">巡检聊天</h2>
      <ErrorBanner message={error} />
      <ol className="max-h-80 space-y-3 overflow-y-auto">
        {messages.map((message) => (
          <li key={message.id} className="border-l-2 pl-3 text-sm">
            <p className="font-medium">
              {message.displayName} · {formatTime(message.createdAt)}
            </p>
            {message.body && (
              <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
            )}
            {message.imageUrl && (
              <img
                className="mt-2 max-h-56 max-w-full object-contain"
                src={message.imageUrl}
                alt="聊天图片"
              />
            )}
          </li>
        ))}
      </ol>
      {canSend && (
        <div className="space-y-2">
          <textarea
            aria-label="聊天内容"
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            maxLength={1000}
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={imageInput}
              aria-label="选择聊天图片"
              accept="image/jpeg,image/png"
              className="max-w-full text-sm"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <Button
              disabled={busy || (!text.trim() && !file)}
              onClick={() => void send()}
            >
              发送
            </Button>
          </div>
          {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
        </div>
      )}
    </section>
  );
}
