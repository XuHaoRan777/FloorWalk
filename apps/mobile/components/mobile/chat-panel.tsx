import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  AppState,
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
import { styles } from './styles';

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
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
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

  useEffect(() => {
    errorShown.current = Boolean(error);
  }, [error]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppActive(state === 'active'),
    );
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const syncFocus = () => setFocused(document.hasFocus());
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
    void api
      .chatMessages(inspectionId)
      .then((response) => {
        if (!active) return;
        latestSeq.current = response.messages.at(-1)?.seq ?? null;
        setMessages(response.messages);
        setHasMoreBefore(response.hasMoreBefore);
        loaded.current = true;
        requestAnimationFrame(() =>
          scroll.current?.scrollToEnd({ animated: false }),
        );
      })
      .catch((cause: unknown) => {
        if (active) setError(userFacingError(cause));
      });
    return () => {
      active = false;
    };
  }, [inspectionId]);

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
        setHasMoreBefore(response.hasMoreBefore);
        if (response.messages.length) {
          latestSeq.current =
            response.messages.at(-1)?.seq ?? latestSeq.current;
          setMessages((current) => mergeMessages(current, response.messages));
          requestAnimationFrame(() =>
            scroll.current?.scrollToEnd({ animated: true }),
          );
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
      latestSeq.current = message.seq;
      setMessages((current) => mergeMessages(current, [message]));
      setText('');
      setImage(null);
      requestAnimationFrame(() =>
        scroll.current?.scrollToEnd({ animated: true }),
      );
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
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        巡检聊天
      </Text>
      <ErrorBanner message={error} />
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
        onContentSizeChange={() => {
          if (!loadingEarlier) scroll.current?.scrollToEnd({ animated: false });
        }}
        testID="chat-message-list"
      >
        {messages.map((message) => (
          <View
            key={message.id}
            style={styles.chatMessage}
            testID={`chat-message-${message.id}`}
          >
            <Text style={styles.label}>
              {message.displayName} · {roleLabels[message.role]} ·{' '}
              {new Date(message.createdAt).toLocaleString()}
            </Text>
            {message.body && <Text style={styles.value}>{message.body}</Text>}
            {message.imageUrl && (
              <Image
                accessibilityLabel="聊天图片"
                onError={() => void refreshImage(message.id)}
                resizeMode="contain"
                source={{ uri: message.imageUrl }}
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
            placeholder="输入消息"
            style={styles.noteInput}
            value={text}
          />
          <Text style={styles.muted} accessibilityLiveRegion="polite">
            {text.length}/1000
          </Text>
          {image && (
            <Text style={styles.muted}>{image.fileName ?? '已选择图片'}</Text>
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
