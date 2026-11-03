import tokens from '../../../packages/tokens/native.json';
import { useFonts } from 'expo-font';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';

const checklistItems = [
  '门头灯箱',
  '地面清洁',
  '冷柜温度',
  '食品效期',
  '收银台整洁',
  '物料陈列',
  '员工着装',
  '闭店记录',
];

export default function DesignSamplesPage() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    [tokens.font.mono.regular]: IBMPlexMono_400Regular,
    [tokens.font.sans.regular]: IBMPlexSans_400Regular,
    [tokens.font.sans.medium]: IBMPlexSans_500Medium,
    [tokens.font.sans.semibold]: IBMPlexSans_600SemiBold,
  });

  if (!fontsLoaded) return null;

  const previewItems = checklistItems.slice(0, 3);

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingBottom: insets.bottom, paddingTop: insets.top }}
    >
      <View className="h-12 flex-row items-center justify-between px-lg">
        <Text
          className="text-foreground"
          style={{ fontFamily: tokens.font.sans.semibold, fontSize: 16 }}
        >
          FloorWalk
        </Text>
        <Text
          className="text-muted-foreground"
          style={{ fontFamily: tokens.font.sans.regular, fontSize: 13 }}
        >
          Northbean Coffee
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-lg px-lg pb-xxl pt-lg"
      >
        <View className="gap-sm">
          <Text
            className="text-muted-foreground"
            style={{ fontFamily: tokens.font.mono.regular, fontSize: 12 }}
          >
            NB-001 · 店员端
          </Text>
          <Text
            accessibilityRole="header"
            className="text-foreground text-2xl"
            style={{ fontFamily: tokens.font.sans.semibold }}
          >
            今日待巡
          </Text>
          <Text
            className="text-muted-foreground"
            style={{ fontFamily: tokens.font.sans.regular, fontSize: 14 }}
          >
            今天应先完成什么？
          </Text>
        </View>

        <View className="gap-md rounded-sheet border border-border bg-card p-lg">
          <View className="gap-xs">
            <Text
              className="text-muted-foreground"
              style={{ fontFamily: tokens.font.sans.medium, fontSize: 12 }}
            >
              检查模板
            </Text>
            <View className="flex-row items-center justify-between">
              <Text
                className="text-foreground text-xl"
                style={{ fontFamily: tokens.font.sans.semibold }}
              >
                开店检查
              </Text>
              <Text
                className="text-accent"
                style={{ fontFamily: tokens.font.mono.regular, fontSize: 12 }}
              >
                {checklistItems.length} 项
              </Text>
            </View>
          </View>

          <View>
            {previewItems.map((item, index) => (
              <View
                key={item}
                className="min-h-12 flex-row items-center gap-md border-border"
                style={{ borderBottomWidth: index < 2 ? 1 : 0 }}
              >
                <View
                  accessibilityElementsHidden
                  className="h-4 w-4 rounded-control border border-border bg-active"
                />
                <Text
                  className="flex-1 text-foreground"
                  style={{ fontFamily: tokens.font.sans.regular, fontSize: 14 }}
                >
                  {item}
                </Text>
                {index === 2 && (
                  <Text
                    className="text-success"
                    style={{
                      fontFamily: tokens.font.sans.medium,
                      fontSize: 12,
                    }}
                  >
                    必拍
                  </Text>
                )}
              </View>
            ))}
          </View>

          <Text
            className="text-muted-foreground"
            style={{ fontFamily: tokens.font.sans.regular, fontSize: 12 }}
          >
            其余 {checklistItems.length - previewItems.length} 项
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/')}
          className="min-h-12 items-center justify-center rounded-control bg-primary"
        >
          <Text
            className="text-primary-foreground"
            style={{ fontFamily: tokens.font.sans.semibold, fontSize: 15 }}
          >
            开始巡检
          </Text>
        </Pressable>
      </ScrollView>

      <View className="min-h-14 flex-row items-center justify-around border-t border-border bg-background">
        {['今日待巡', '记录', '我的'].map((tab, index) => {
          const active = index === 0;
          return (
            <View
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab}
              className={
                active ? 'rounded-control bg-raised px-lg py-sm' : 'px-lg py-sm'
              }
            >
              <Text
                className={active ? 'text-accent' : 'text-muted-foreground'}
                style={{
                  fontFamily: active
                    ? tokens.font.sans.medium
                    : tokens.font.sans.regular,
                  fontSize: 12,
                }}
              >
                {tab}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
