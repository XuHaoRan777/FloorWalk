import { ScrollView, Text, View } from 'react-native';
import { styles } from './styles';

export function RecordsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text accessibilityRole="header" style={styles.heading}>
        巡检记录
      </Text>
      <View style={styles.empty}>
        <Text style={styles.muted}>暂无巡检记录</Text>
      </View>
    </ScrollView>
  );
}
