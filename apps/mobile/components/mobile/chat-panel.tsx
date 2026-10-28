import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image, Text, TextInput, View } from 'react-native';
import type { ChatMessage } from '@libs/shared';
import { api, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { styles } from './styles';

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

  useEffect(() => {
    let active = true;
    void api
      .chatMessages(inspectionId)
      .then((response) => active && setMessages(response.messages))
      .catch((cause: unknown) => active && setError(userFacingError(cause)));
    return () => {
      active = false;
    };
  }, [inspectionId]);

  async function chooseImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setImage(result.assets[0]);
  }

  async function send() {
    if (busy || (!text.trim() && !image)) return;
    setBusy(true);
    setError(null);
    try {
      const message = await api.sendChatMessage(inspectionId, {
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(image
          ? { imageUri: image.uri, fileName: image.fileName ?? 'chat-image.jpg' }
          : {}),
      });
      setMessages((current) => [...current, message]);
      setText('');
      setImage(null);
    } catch (cause) {
      setError(userFacingError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>巡检聊天</Text>
      {messages.map((message) => (
        <View key={message.id} style={styles.chatMessage}>
          <Text style={styles.label}>
            {message.displayName} · {new Date(message.createdAt).toLocaleString()}
          </Text>
          {message.body && <Text style={styles.value}>{message.body}</Text>}
          {message.imageUrl && (
            <Image
              accessibilityLabel="聊天图片"
              resizeMode="contain"
              source={{ uri: message.imageUrl }}
              style={styles.chatImage}
            />
          )}
        </View>
      ))}
      <ErrorBanner message={error} />
      {canSend && (
        <>
          <TextInput
            accessibilityLabel="聊天内容"
            editable={!busy}
            maxLength={1000}
            multiline
            onChangeText={setText}
            placeholder="输入消息"
            style={styles.noteInput}
            value={text}
          />
          {image && <Text style={styles.muted}>{image.fileName ?? '已选择图片'}</Text>}
          <PrimaryButton disabled={busy} onPress={() => void chooseImage()} variant="secondary">
            选择图片
          </PrimaryButton>
          <PrimaryButton
            disabled={busy || (!text.trim() && !image)}
            onPress={() => void send()}
          >
            发送
          </PrimaryButton>
        </>
      )}
    </View>
  );
}
