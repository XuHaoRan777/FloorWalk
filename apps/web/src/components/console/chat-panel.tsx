import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@libs/shared';
import {
  getChatImageUrl,
  getChatMessages,
  sendChatMessage,
} from '@/lib/api/chat';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './error-banner';
import { formatTime, getErrorMessage } from './helpers';

const roleLabels = {
  inspector: '店员',
  supervisor: '主管',
  hq: '总部',
} as const;
const maxFileSize = 10 * 1024 * 1024;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) => Number(left.seq) - Number(right.seq),
  );
}

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
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const latestSeq = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const loadedRef = useRef(false);
  const triedImageRefresh = useRef(new Set<string>());
  const pendingPrepend = useRef<{ height: number; top: number } | null>(null);
  const scrollToBottom = useRef(false);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const prepend = pendingPrepend.current;
    if (prepend) {
      element.scrollTop = prepend.top + element.scrollHeight - prepend.height;
      pendingPrepend.current = null;
    } else if (scrollToBottom.current) {
      element.scrollTop = element.scrollHeight;
      scrollToBottom.current = false;
    }
  }, [messages]);

  useEffect(() => {
    let active = true;
    loadedRef.current = false;
    latestSeq.current = null;
    loadingRef.current = false;
    triedImageRefresh.current.clear();
    setMessages([]);
    setHasMoreBefore(false);
    setError('');
    void getChatMessages(inspectionId)
      .then((response) => {
        if (!active) return;
        latestSeq.current = response.messages.at(-1)?.seq ?? null;
        scrollToBottom.current = true;
        setMessages(response.messages);
        setHasMoreBefore(response.hasMoreBefore);
        loadedRef.current = true;
      })
      .catch((reason: unknown) => {
        if (active) setError(getErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [inspectionId]);

  useEffect(() => {
    let active = true;
    const isVisible = () =>
      document.visibilityState === 'visible' && document.hasFocus();
    const poll = async () => {
      if (!active || !loadedRef.current || !isVisible() || loadingRef.current)
        return;
      loadingRef.current = true;
      const element = list.current;
      const nearBottom = element
        ? element.scrollHeight - element.scrollTop - element.clientHeight < 48
        : true;
      try {
        const response = await getChatMessages(inspectionId, {
          ...(latestSeq.current ? { after: latestSeq.current } : {}),
        });
        if (!active) return;
        setError('');
        setHasMoreBefore(response.hasMoreBefore);
        if (response.messages.length) {
          latestSeq.current =
            response.messages.at(-1)?.seq ?? latestSeq.current;
          scrollToBottom.current = nearBottom;
          setMessages((current) => mergeMessages(current, response.messages));
        }
      } catch (reason) {
        if (active && !error) setError(getErrorMessage(reason));
      } finally {
        loadingRef.current = false;
      }
    };
    const syncVisibility = () => {
      if (isVisible()) void poll();
    };
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('focus', syncVisibility);
    window.addEventListener('blur', syncVisibility);
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('focus', syncVisibility);
      window.removeEventListener('blur', syncVisibility);
    };
  }, [inspectionId, error]);

  async function loadEarlier() {
    const firstSeq = messages[0]?.seq;
    const element = list.current;
    if (!firstSeq || !element || loadingEarlier) return;
    setLoadingEarlier(true);
    setError('');
    try {
      const response = await getChatMessages(inspectionId, {
        before: firstSeq,
      });
      pendingPrepend.current = {
        height: element.scrollHeight,
        top: element.scrollTop,
      };
      setMessages((current) => mergeMessages(current, response.messages));
      setHasMoreBefore(response.hasMoreBefore);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function send() {
    if (busy || text.length > 1000 || (!text.trim() && !file)) return;
    setBusy(true);
    setError('');
    try {
      const message = await sendChatMessage(inspectionId, {
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(file ? { file } : {}),
      });
      latestSeq.current = message.seq;
      scrollToBottom.current = true;
      setMessages((current) => mergeMessages(current, [message]));
      setText('');
      setFile(null);
      if (imageInput.current) imageInput.current.value = '';
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function selectFile(candidate?: File) {
    if (!candidate) {
      setFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(candidate.type)) {
      setError('仅支持 JPEG 或 PNG 图片。');
      if (imageInput.current) imageInput.current.value = '';
      return;
    }
    if (candidate.size > maxFileSize) {
      setError('图片不能超过 10MB。');
      if (imageInput.current) imageInput.current.value = '';
      return;
    }
    setError('');
    setFile(candidate);
  }

  async function refreshImage(messageId: string) {
    if (triedImageRefresh.current.has(messageId)) return;
    triedImageRefresh.current.add(messageId);
    try {
      const signed = await getChatImageUrl(messageId);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, imageUrl: signed.url }
            : message,
        ),
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label="巡检聊天">
      <h2 className="text-lg font-semibold">巡检聊天</h2>
      <ErrorBanner message={error} />
      {hasMoreBefore && (
        <Button
          variant="outline"
          size="sm"
          disabled={loadingEarlier}
          onClick={() => void loadEarlier()}
        >
          {loadingEarlier ? '加载中…' : '加载更早'}
        </Button>
      )}
      <ol
        ref={list}
        aria-label="聊天消息"
        className="max-h-80 space-y-3 overflow-y-auto"
      >
        {messages.map((message) => (
          <li
            key={message.id}
            data-message-id={message.id}
            className="border-l-2 pl-3 text-sm"
          >
            <p className="font-medium">
              {message.displayName} · {roleLabels[message.role]} ·{' '}
              {formatTime(message.createdAt)}
            </p>
            {message.body && (
              <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
            )}
            {message.imageUrl && (
              <img
                className="mt-2 max-h-56 max-w-full object-contain"
                src={message.imageUrl}
                alt="聊天图片"
                onError={() => void refreshImage(message.id)}
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
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {text.length}/1000
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={imageInput}
              aria-label="选择聊天图片"
              accept="image/jpeg,image/png"
              className="max-w-full text-sm"
              onChange={(event) => selectFile(event.target.files?.[0])}
              type="file"
            />
            <Button
              disabled={busy || text.length > 1000 || (!text.trim() && !file)}
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
