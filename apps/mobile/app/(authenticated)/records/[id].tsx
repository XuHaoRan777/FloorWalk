import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ChatPanel } from '../../../components/mobile/chat-panel';
import { styles } from '../../../components/mobile/styles';

export default function RecordDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text accessibilityRole="header" style={styles.heading}>
        巡检记录详情
      </Text>
      <ChatPanel inspectionId={id} canSend />
    </ScrollView>
  );
}
