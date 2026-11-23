import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  SlidersHorizontal,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tokens from '../../../../../packages/tokens/native.json';
import { classes, styles } from '../styles';
import { useTabColors } from '../use-tab-colors';

const entries: {
  href: Href;
  label: string;
  icon: LucideIcon;
  testID: string;
}[] = [
  {
    href: '/admin/accounts',
    label: '人员管理',
    icon: Users,
    testID: 'admin-entry-accounts',
  },
  {
    href: '/admin/sites',
    label: '门店',
    icon: Store,
    testID: 'admin-entry-sites',
  },
  {
    href: '/admin/templates',
    label: '模板',
    icon: ClipboardList,
    testID: 'admin-entry-templates',
  },
  {
    href: '/admin/ai-standards',
    label: 'AI 审核标准',
    icon: SlidersHorizontal,
    testID: 'admin-entry-ai-standards',
  },
  {
    href: '/admin/schedules',
    label: '日程方案',
    icon: CalendarDays,
    testID: 'admin-entry-schedules',
  },
  {
    href: '/admin/site-schedules',
    label: '门店日程安排',
    icon: CalendarRange,
    testID: 'admin-entry-site-schedules',
  },
];

export function AdminHomeScreen() {
  const router = useRouter();
  const colors = useTabColors();

  return (
    <SafeAreaView
      className={classes.background}
      edges={['top']}
      style={{ flex: 1 }}
    >
      <ScrollView
        className={classes.background}
        contentContainerStyle={styles.page}
      >
        <Text
          accessibilityRole="header"
          className={classes.foreground}
          style={styles.heading}
        >
          管理配置
        </Text>
        <View>
          {entries.map(({ href, label, icon: Icon, testID }) => (
            <Pressable
              accessibilityRole="button"
              className={`${classes.background} active:bg-active flex-row items-center border-b border-border`}
              key={testID}
              onPress={() => router.push(href)}
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: tokens.space.md,
                height: 64,
                paddingHorizontal: tokens.space.xs,
              }}
              testID={testID}
            >
              <Icon color={colors.primary} size={20} />
              <Text className={classes.foreground} style={styles.cardTitle}>
                {label}
              </Text>
              <View style={{ flex: 1 }} />
              <ArrowRight color={colors.mutedForeground} size={18} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
