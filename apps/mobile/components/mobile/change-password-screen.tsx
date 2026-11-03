import { ScrollView, Text } from 'react-native';
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

export function ChangePasswordScreen({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView
      className={classes.background}
      contentContainerStyle={styles.page}
    >
      <Text
        accessibilityRole="header"
        className={classes.foreground}
        style={styles.heading}
      >
        修改密码
      </Text>
      <PrimaryButton onPress={onBack} variant="secondary">
        返回我的
      </PrimaryButton>
    </ScrollView>
  );
}
