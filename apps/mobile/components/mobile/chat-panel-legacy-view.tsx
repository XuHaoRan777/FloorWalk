import type { Ref } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ChatMessage } from '@libs/shared';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

export function ChatPanelLegacyView({
  busy,
  canRetry,
  canSend,
  error,
  hasMoreBefore,
  image,
  loadingEarlier,
  loadingMessages,
  messages,
  scrollRef,
  text,
  sendDisabled,
  onChangeText,
  onChooseImage,
  onContentSizeChange,
  onLoadEarlier,
  onRefreshImage,
  onScroll,
  onSend,
  onRetry,
}: {
  busy: boolean;
  canRetry: boolean;
  canSend: boolean;
  error: string | null;
  hasMoreBefore: boolean;
  image: ImagePicker.ImagePickerAsset | null;
  loadingEarlier: boolean;
  loadingMessages: boolean;
  messages: ChatMessage[];
  scrollRef: Ref<ScrollViewInstance>;
  text: string;
  sendDisabled: boolean;
  onChangeText: (value: string) => void;
  onChooseImage: () => void;
  onContentSizeChange: (width: number, height: number) => void;
  onLoadEarlier: () => void;
  onRefreshImage: (messageId: string) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onSend: () => void;
  onRetry: () => void;
}) {
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
      {canRetry ? (
        <PrimaryButton onPress={onRetry} variant="secondary">
          重新加载聊天
        </PrimaryButton>
      ) : null}
      {hasMoreBefore ? (
        <PrimaryButton
          disabled={loadingEarlier}
          onPress={onLoadEarlier}
          variant="secondary"
        >
          {loadingEarlier ? '加载中…' : '加载更早'}
        </PrimaryButton>
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: 320 }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
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
              {message.displayName} ·{' '}
              {message.role === 'store_manager' ? '店长' : '商家管理员'} ·{' '}
              {new Date(message.createdAt).toLocaleString()}
            </Text>
            {message.body ? (
              <Text className={classes.foreground} style={styles.value}>
                {message.body}
              </Text>
            ) : null}
            {message.imageUrl ? (
              <Image
                accessibilityLabel="聊天图片"
                onError={() => onRefreshImage(message.id)}
                resizeMode="contain"
                source={{ uri: message.imageUrl }}
                className={classes.chatImage}
                style={styles.chatImage}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
      {canSend ? (
        <>
          <TextInput
            accessibilityLabel="聊天内容"
            hitSlop={{ top: 1, bottom: 1, left: 0, right: 0 }}
            editable={!busy}
            multiline
            onChangeText={onChangeText}
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
          {image ? (
            <Text className={classes.muted} style={styles.muted}>
              {image.fileName ?? '已选择图片'}
            </Text>
          ) : null}
          <PrimaryButton
            disabled={busy}
            onPress={onChooseImage}
            variant="secondary"
          >
            选择图片
          </PrimaryButton>
          <PrimaryButton disabled={sendDisabled} onPress={onSend}>
            发送
          </PrimaryButton>
        </>
      ) : null}
    </View>
  );
}
