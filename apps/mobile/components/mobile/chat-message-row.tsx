import { Image, View } from 'react-native';
import type { ChatMessage } from '@libs/shared';
import { MobileText } from './manager-ui';
import { styles } from './chat-panel.styles';

const roleLabels = {
  store_manager: '店长',
  admin: '商家管理员',
} as const;

export function ChatMessageRow({
  message,
  onRefreshImage,
}: {
  message: ChatMessage;
  onRefreshImage: (messageId: string) => void;
}) {
  return (
    <View style={styles.message} testID={`chat-message-${message.id}`}>
      <View style={styles.messageMetadata}>
        <MobileText size="xs" tone="muted" numberOfLines={1}>
          {message.displayName}
        </MobileText>
        <MobileText role="fixed" size="xs" tone="muted">
          · {roleLabels[message.role]} ·
        </MobileText>
        <MobileText role="number" size="xs" tone="muted">
          {new Date(message.createdAt).toLocaleString()}
        </MobileText>
      </View>
      {message.body ? (
        <MobileText size="base" style={styles.messageBody}>
          {message.body}
        </MobileText>
      ) : null}
      {message.imageUrl ? (
        <Image
          accessibilityLabel="聊天图片"
          onError={() => onRefreshImage(message.id)}
          resizeMode="contain"
          source={{ uri: message.imageUrl }}
          style={styles.chatImage}
        />
      ) : null}
    </View>
  );
}
