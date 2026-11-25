import {
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { ImagePlus } from 'lucide-react-native';
import { MobileButton, MobileText } from './manager-ui';
import { styles } from './chat-panel.styles';
import tokens from '../../../../packages/tokens/native.json';

export function ChatComposer({
  busy,
  imageName,
  text,
  sendDisabled,
  onChooseImage,
  onChangeText,
  onSend,
}: {
  busy: boolean;
  imageName: string | null;
  text: string;
  sendDisabled: boolean;
  onChooseImage: () => void;
  onChangeText: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <View style={styles.composer}>
      {imageName ? (
        <MobileText
          size="xs"
          tone="muted"
          numberOfLines={1}
          style={styles.selectedImage}
        >
          {imageName}
        </MobileText>
      ) : null}
      <View style={styles.composerRow}>
        <Pressable
          accessibilityLabel="选择图片"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onChooseImage}
          style={({ pressed }) => [
            styles.imageButton,
            pressed && styles.imageButtonPressed,
          ]}
        >
          <ImagePlus color={tokens.mobile.primary} size={20} />
        </Pressable>
        <TextInput
          accessibilityLabel="聊天内容"
          editable={!busy}
          hitSlop={{ top: 1, bottom: 1, left: 0, right: 0 }}
          multiline
          onChangeText={onChangeText}
          placeholder="输入消息"
          placeholderTextColor={tokens.mobile.disabledForeground}
          style={styles.messageInput}
          value={text}
        />
        <MobileButton
          disabled={sendDisabled}
          onPress={onSend}
          style={styles.sendButton}
        >
          发送
        </MobileButton>
      </View>
      <View style={styles.composerFooter}>
        <MobileText
          accessibilityLiveRegion="polite"
          role="number"
          size="xs"
          tone="muted"
        >
          {text.length}/1000
        </MobileText>
      </View>
    </View>
  );
}
