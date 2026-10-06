import { APP_NAME } from '@libs/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ButtonText } from '../components/ui/button';

export default function HomeScreen() {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>门店巡检 · 工程演示</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {APP_NAME}
        </Text>
        <Text style={styles.description}>
          移动端骨架已就绪，业务功能尚未开放。
        </Text>
        <Button
          size="lg"
          onPress={() => setConfirmed(true)}
          accessibilityLabel="体验按钮"
        >
          <ButtonText>体验按钮</ButtonText>
        </Button>
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>
          {confirmed ? '按钮响应成功' : '点击按钮，检查本地交互。'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 },
  eyebrow: { color: '#525252', fontSize: 14 },
  title: { color: '#171717', fontSize: 36, fontWeight: '600' },
  description: { color: '#525252', fontSize: 16, lineHeight: 26 },
  feedback: { color: '#525252', fontSize: 14, lineHeight: 22 },
});
