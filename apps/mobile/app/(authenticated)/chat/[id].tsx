import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChatPanel } from '../../../components/mobile/chat-panel';
import { useSession } from '../../../components/mobile/session-provider';
import { classes, styles } from '../../../components/mobile/styles';

export default function NotificationChatPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  if (!session || !id) return null;
  const isManager = session.user.role === 'store_manager';

  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(isManager ? '/today' : '/admin')
        }
        style={styles.touchTarget}
      >
        <Text className={classes.link} style={styles.link}>
          返回
        </Text>
      </Pressable>
      <View>
        <Text
          accessibilityRole="header"
          className={classes.foreground}
          style={styles.heading}
        >
          巡检聊天
        </Text>
        {!isManager ? (
          <Text className={classes.muted} style={styles.muted}>
            管理员只读查看
          </Text>
        ) : null}
      </View>
      <ChatPanel inspectionId={id} canSend={isManager} />
    </ScrollView>
  );
}
