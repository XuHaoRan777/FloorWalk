import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  AppState,
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  type ScrollViewInstance,
  View,
} from 'react-native';
import type { ChatMessage } from '@libs/shared';
import { FileText } from 'lucide-react-native';
import { api, userFacingError } from '../../lib/api';
import { chatImageUrl } from '../../lib/api/chat';
import { ErrorBanner } from './error-banner';
import { ChatComposer } from './chat-composer';
import { ChatPanelLegacyView } from './chat-panel-legacy-view';
import { ChatMessageRow } from './chat-message-row';
import { MobileEmptyState, MobileSurfaceCard } from './manager-data-ui';
import { MobileButton, MobileText } from './manager-ui';
import tokens from '../../../../packages/tokens/native.json';
import { styles } from './chat-panel.styles';

const maxFileSize = 10 * 1024 * 1024;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming)
    if (!byId.has(message.id)) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) => Number(left.seq) - Number(right.seq),
  );
}

export function ChatPanel({
  inspectionId,
  canSend,
  variant = 'embedded',
}: {
  inspectionId: string;
  canSend: boolean;
  variant?: 'embedded' | 'screen' | 'legacy';
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const [focused, setFocused] = useState(true);
  const scroll = useRef<ScrollViewInstance | null>(null);
  const latestSeq = useRef<string | null>(null);
  const loaded = useRef(false);
  const fetching = useRef(false);
  const triedImageRefresh = useRef(new Set<string>());
  const errorShown = useRef(false);
  const contentHeight = useRef(0);
  const scrollOffset = useRef(0);
  const pendingPrepend = useRef<{ height: number; top: number } | null>(null);
  const scrollToBottom = useRef(false);

  useEffect(() => {
    errorShown.current = Boolean(error);
  }, [error]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppActive(state === 'active'),
    );
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const syncFocus = () =>
        setFocused(
          document.visibilityState === 'visible' && document.hasFocus(),
        );
      syncFocus();
      window.addEventListener('focus', syncFocus);
      window.addEventListener('blur', syncFocus);
      document.addEventListener('visibilitychange', syncFocus);
      return () => {
        subscription.remove();
        window.removeEventListener('focus', syncFocus);
        window.removeEventListener('blur', syncFocus);
        document.removeEventListener('visibilitychange', syncFocus);
      };
    }
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    loaded.current = false;
    latestSeq.current = null;
    fetching.current = false;
    triedImageRefresh.current.clear();
    setMessages([]);
    setHasMoreBefore(false);
    setError(null);
    setLoadingMessages(true);
    void api
      .chatMessages(inspectionId)
      .then((response) => {
        if (!active) return;
        latestSeq.current = response.messages.at(-1)?.seq ?? null;
        setMessages(response.messages);
        setHasMoreBefore(response.hasMoreBefore);
        loaded.current = true;
        scrollToBottom.current = true;
        setLoadingMessages(false);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(userFacingError(cause));
          setLoadingMessages(false);
        }
      });
    return () => {
      active = false;
    };
  }, [inspectionId]);

  async function retryMessages() {
    setLoadingMessages(true);
    setError(null);
    try {
      const response = await api.chatMessages(inspectionId);
      latestSeq.current = response.messages.at(-1)?.seq ?? null;
      setMessages(response.messages);
      setHasMoreBefore(response.hasMoreBefore);
      loaded.current = true;
      scrollToBottom.current = true;
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (
        !active ||
        !loaded.current ||
        !appActive ||
        !focused ||
        fetching.current
      )
        return;
      fetching.current = true;
      try {
        const response = await api.chatMessages(inspectionId, {
          ...(latestSeq.current ? { after: latestSeq.current } : {}),
        });
        if (!active) return;
        setError(null);
        if (response.messages.length) {
          latestSeq.current =
            response.messages.at(-1)?.seq ?? latestSeq.current;
          scrollToBottom.current = true;
          setMessages((current) => mergeMessages(current, response.messages));
        }
      } catch (cause) {
        if (active && !errorShown.current) {
          errorShown.current = true;
          setError(userFacingError(cause));
        }
      } finally {
        fetching.current = false;
      }
    };
    if (appActive && focused) void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [appActive, focused, inspectionId]);

  async function loadEarlier() {
    const firstSeq = messages[0]?.seq;
    if (!firstSeq || loadingEarlier) return;
    setLoadingEarlier(true);
    setError(null);
    try {
      const response = await api.chatMessages(inspectionId, {
        before: firstSeq,
      });
      pendingPrepend.current = {
        height: contentHeight.current,
        top: scrollOffset.current,
      };
      scrollToBottom.current = false;
      setMessages((current) => mergeMessages(current, response.messages));
      setHasMoreBefore(response.hasMoreBefore);
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function chooseImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!['image/jpeg', 'image/png'].includes(asset.mimeType ?? '')) {
        setError('仅支持 JPEG 或 PNG 图片。');
        return;
      }
      if (asset.fileSize !== undefined && asset.fileSize > maxFileSize) {
        setError('图片不能超过 10MB。');
        return;
      }
      setError(null);
      setImage(asset);
    } catch (cause) {
      setError(userFacingError(cause));
    }
  }

  async function send() {
    if (busy || text.length > 1000 || (!text.trim() && !image)) return;
    setBusy(true);
    setError(null);
    try {
      const message = await api.sendChatMessage(inspectionId, {
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(image
          ? {
              imageUri: image.uri,
              fileName: image.fileName ?? 'chat-image.jpg',
            }
          : {}),
      });
      scrollToBottom.current = true;
      setMessages((current) => mergeMessages(current, [message]));
      setText('');
      setImage(null);
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function refreshImage(messageId: string) {
    if (triedImageRefresh.current.has(messageId)) return;
    triedImageRefresh.current.add(messageId);
    try {
      const signed = await chatImageUrl(messageId);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, imageUrl: signed.url }
            : message,
        ),
      );
    } catch (cause) {
      setError(userFacingError(cause));
    }
  }

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    (scrollOffset.current = event.nativeEvent.contentOffset.y);
  const onContentSizeChange = (_width: number, height: number) => {
    contentHeight.current = height;
    const prepend = pendingPrepend.current;
    if (prepend) {
      scrollToBottom.current = false;
      const top = prepend.top + height - prepend.height;
      scrollOffset.current = top;
      scroll.current?.scrollTo({ y: top, animated: false });
      pendingPrepend.current = null;
    } else if (scrollToBottom.current) {
      scroll.current?.scrollToEnd({ animated: false });
      scrollToBottom.current = false;
    }
  };

  if (variant === 'legacy') {
    return (
      <ChatPanelLegacyView
        busy={busy}
        canRetry={Boolean(error && !loadingMessages && !loaded.current)}
        canSend={canSend}
        error={error}
        hasMoreBefore={hasMoreBefore}
        image={image}
        loadingEarlier={loadingEarlier}
        loadingMessages={loadingMessages}
        messages={messages}
        scrollRef={scroll}
        text={text}
        sendDisabled={busy || text.length > 1000 || (!text.trim() && !image)}
        onChangeText={setText}
        onChooseImage={() => void chooseImage()}
        onContentSizeChange={onContentSizeChange}
        onLoadEarlier={() => void loadEarlier()}
        onRefreshImage={(messageId) => void refreshImage(messageId)}
        onScroll={onScroll}
        onSend={() => void send()}
        onRetry={() => void retryMessages()}
      />
    );
  }

  const screenMode = variant === 'screen';
  const content = (
    <>
      {!screenMode ? (
        <MobileText accessibilityRole="header" role="fixed" size="lg">
          巡检聊天
        </MobileText>
      ) : null}
      <ErrorBanner message={error} />
      {error && !loadingMessages && !loaded.current && (
        <MobileButton onPress={() => void retryMessages()} variant="secondary">
          重新加载聊天
        </MobileButton>
      )}
      {hasMoreBefore && (
        <MobileButton
          disabled={loadingEarlier}
          onPress={() => void loadEarlier()}
          variant="secondary"
        >
          {loadingEarlier ? '加载中…' : '加载更早'}
        </MobileButton>
      )}
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.messageListContent}
        scrollEventThrottle={16}
        style={screenMode ? styles.screenMessageList : styles.embeddedMessageList}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        testID="chat-message-list"
      >
        {loadingMessages ? (
          <View style={styles.loadingState}>
            <ActivityIndicator
              accessibilityLabel="正在加载聊天消息"
              color={tokens.mobile.primary}
            />
            <MobileText size="sm" tone="muted">
              正在加载聊天消息…
            </MobileText>
          </View>
        ) : !error && messages.length === 0 ? (
          <MobileEmptyState
            title="暂无聊天消息"
            description="发送的文字或图片会显示在这里。"
            icon={<FileText color={tokens.mobile.primary} size={24} />}
            style={
              screenMode ? styles.screenEmptyState : styles.emptyState
            }
          />
        ) : null}
        {messages.map((message) => (
        <ChatMessageRow
          key={message.id}
          message={message}
          onRefreshImage={(messageId) => void refreshImage(messageId)}
        />
        ))}
      </ScrollView>
      {canSend ? (
        <ChatComposer
          busy={busy}
          imageName={image?.fileName ?? (image ? '已选择图片' : null)}
          text={text}
          sendDisabled={busy || text.length > 1000 || (!text.trim() && !image)}
          onChooseImage={() => void chooseImage()}
          onChangeText={setText}
          onSend={() => void send()}
        />
      ) : null}
    </>
  );

  return screenMode ? (
    <View style={styles.screenPanel}>{content}</View>
  ) : (
    <MobileSurfaceCard style={styles.embeddedPanel}>{content}</MobileSurfaceCard>
  );
}

