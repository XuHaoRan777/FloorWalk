import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MobileTopBar } from '../../../components/mobile/manager-ui';
import { ChatPanel } from '../../../components/mobile/chat-panel';
import { useSession } from '../../../components/mobile/session-provider';
import {
  classes,
  styles as legacyStyles,
} from '../../../components/mobile/styles';
import tokens from '../../../../../packages/tokens/native.json';

export default function NotificationChatPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  if (!session || !id) return null;
  const isManager = session.user.role === 'store_manager';
  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace(isManager ? '/today' : '/admin/today');

  if (!isManager) {
    return (
      <ScrollView
        className={classes.background}
        contentContainerStyle={legacyStyles.page}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          style={legacyStyles.touchTarget}
        >
          <Text className={classes.link} style={legacyStyles.link}>
            返回
          </Text>
        </Pressable>
        <View>
          <Text
            accessibilityRole="header"
            className={classes.foreground}
            style={legacyStyles.heading}
          >
            巡检聊天
          </Text>
          <Text className={classes.muted} style={legacyStyles.muted}>
            管理员只读查看
          </Text>
        </View>
        <ChatPanel inspectionId={id} canSend={false} variant="legacy" />
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <MobileTopBar
        backLabel="返回上级页面"
        backText="返回"
        onBack={goBack}
        title="巡检沟通"
        titleRole="title"
        titleSize="2xl"
      />
      <View style={styles.panel}>
        <ChatPanel inspectionId={id} canSend variant="screen" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: tokens.mobile.background, flex: 1 },
  panel: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: tokens.mobileSpace.lg,
    paddingBottom: tokens.mobileSpace.sm,
  },
});
