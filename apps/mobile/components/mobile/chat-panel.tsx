import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  AppState,
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ChatMessage } from '@libs/shared';
import { api, userFacingError } from '../../lib/api';
import { chatImageUrl } from '../../lib/api/chat';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

const roleLabels = {
  inspector: '店员',
  supervisor: '主管',
  hq: '总部',
} as const;
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
}: {
  inspectionId: string;
  canSend: boolean;
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
  const scroll = useRef<ScrollView>(null);
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

  return (
    <View className={classes.card} style={styles.card}>
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.sectionTitle}
      >
        巡检聊天
      </Text>
      <ErrorBanner message={error} />
      {error && !loadingMessages && !loaded.current && (
        <PrimaryButton onPress={() => void retryMessages()} variant="secondary">
          重新加载聊天
        </PrimaryButton>
      )}
      {hasMoreBefore && (
        <PrimaryButton
          disabled={loadingEarlier}
          onPress={() => void loadEarlier()}
          variant="secondary"
        >
          {loadingEarlier ? '加载中…' : '加载更早'}
        </PrimaryButton>
      )}
      <ScrollView
        ref={scroll}
        style={{ maxHeight: 320 }}
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={(_width, height) => {
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
        }}
        testID="chat-message-list"
      >
        {loadingMessages ? (
          <View className={classes.empty} style={styles.empty}>
            <ActivityIndicator accessibilityLabel="正在加载聊天消息" />
            <Text className={classes.muted} style={styles.muted}>
              正在加载聊天消息…
            </Text>
          </View>
        ) : !error && messages.length === 0 ? (
          <View className={classes.empty} style={styles.empty}>
            <Text className={classes.muted} style={styles.muted}>
              暂无聊天消息。
            </Text>
          </View>
        ) : null}
        {messages.map((message) => (
          <View
            key={message.id}
            className={classes.chatMessage}
            style={styles.chatMessage}
            testID={`chat-message-${message.id}`}
          >
            <Text className={classes.muted} style={styles.label}>
              {message.displayName} · {roleLabels[message.role]} ·{' '}
              {new Date(message.createdAt).toLocaleString()}
            </Text>
            {message.body && (
              <Text className={classes.foreground} style={styles.value}>
                {message.body}
              </Text>
            )}
            {message.imageUrl && (
              <Image
                accessibilityLabel="聊天图片"
                onError={() => void refreshImage(message.id)}
                resizeMode="contain"
                source={{ uri: message.imageUrl }}
                className={classes.chatImage}
                style={styles.chatImage}
              />
            )}
          </View>
        ))}
      </ScrollView>
      {canSend && (
        <>
          <TextInput
            accessibilityLabel="聊天内容"
            editable={!busy}
            multiline
            onChangeText={setText}
            className={classes.noteInput}
            placeholder="输入消息"
            style={styles.noteInput}
            value={text}
          />
          <Text
            className={classes.muted}
            style={styles.muted}
            accessibilityLiveRegion="polite"
          >
            {text.length}/1000
          </Text>
          {image && (
            <Text className={classes.muted} style={styles.muted}>
              {image.fileName ?? '已选择图片'}
            </Text>
          )}
          <PrimaryButton
            disabled={busy}
            onPress={() => void chooseImage()}
            variant="secondary"
          >
            选择图片
          </PrimaryButton>
          <PrimaryButton
            disabled={busy || text.length > 1000 || (!text.trim() && !image)}
            onPress={() => void send()}
          >
            发送
          </PrimaryButton>
        </>
      )}
    </View>
  );
}
