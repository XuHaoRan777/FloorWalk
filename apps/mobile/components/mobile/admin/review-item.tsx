import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import type { TaskReviewItem } from '@libs/shared';
import { AdminCard, AdminText } from './admin-ui';
import { ReviewEvidence } from './review-evidence';
import { reviewTime } from './review-format';
import tokens from '../../../../../packages/tokens/native.json';
import { classes } from '../styles';
import { useTabColors } from '../use-tab-colors';

const labels = {
  pending: '待判定',
  pass: '通过',
  rework: '打回',
  fail: '不合格',
} as const;

export function ReviewItem({
  item,
  selected,
  onSelect,
}: {
  item: TaskReviewItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = useTabColors();
  const [focused, setFocused] = useState(false);
  const firstResult = item.firstResult ? labels[item.firstResult] : null;
  const result = labels[item.result];
  const hasHistory =
    item.firstResult !== null &&
    (item.firstResult !== item.result || item.manuallyDecidedAfterCompletion);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        '选择检查项 ' +
        item.position +
        '，' +
        item.title +
        '，当前判定' +
        result +
        (item.incomplete ? '，未完成' : '')
      }
      accessibilityState={{ selected }}
      onPress={onSelect}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        {
          borderLeftWidth: 3,
          borderLeftColor: selected ? colors.mobileRouteStrong : 'transparent',
          paddingLeft: 9,
        },
        pressed && { backgroundColor: colors.mobilePressedBackground },
      ]}
      testID={'review-item-' + item.position}
    >
      <AdminCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: selected
                ? colors.mobileRouteStrong
                : colors.mobileRoute,
              backgroundColor: selected
                ? colors.mobileRouteStrong
                : colors.mobileSurface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: selected
                  ? tokens.colors.primaryForeground
                  : colors.mobileRouteStrong,
                fontFamily: tokens.font.mono.regular,
                fontSize: tokens.mobileType.xs,
                fontWeight: '600',
              }}
            >
              {String(item.position).padStart(2, '0')}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AdminText>
              {item.title + (item.critical ? ' · 严重项' : '')}
            </AdminText>
            <AdminText>
              {item.minPhotoCount > 0
                ? '至少 ' + item.minPhotoCount + ' 张照片'
                : '可不上传照片，需填写备注'}
            </AdminText>
          </View>
          <Text
            className={
              item.result === 'pass'
                ? classes.mobileSuccessText
                : item.result === 'fail'
                  ? classes.mobileWarningTitle
                  : classes.mobileMuted
            }
            style={{ fontSize: tokens.mobileType.xs, fontWeight: '700' }}
          >
            {result + (item.incomplete ? ' · 未完成' : '')}
          </Text>
        </View>

        <View style={{ gap: 5, paddingLeft: 38 }}>
          <AdminText>
            {(item.uploadedByName ?? '系统') +
              ' · 上传于 ' +
              reviewTime(item.uploadedAt)}
          </AdminText>
          {item.selfAssessment ? (
            <AdminText>
              {'自评：' + (item.selfAssessment === 'pass' ? '通过' : '不通过')}
            </AdminText>
          ) : null}
          {item.acceptanceCriteria ? (
            <AdminText>{'验收要点：' + item.acceptanceCriteria}</AdminText>
          ) : null}
          {item.aiReason ? (
            <AdminText>{'AI 理由：' + item.aiReason}</AdminText>
          ) : null}
          {item.lastReworkReason ? (
            <View
              style={{
                borderLeftWidth: 2,
                borderLeftColor: colors.mobileRoute,
                paddingLeft: 8,
              }}
            >
              <AdminText>{'打回理由：' + item.lastReworkReason}</AdminText>
            </View>
          ) : null}
          {item.note ? <AdminText>{'备注：' + item.note}</AdminText> : null}
          {hasHistory && firstResult ? (
            <View
              style={{
                gap: 4,
                paddingTop: 7,
                borderTopWidth: 1,
                borderTopColor: colors.mobileBorder,
              }}
            >
              <AdminText>
                {'首次结论：' + firstResult + '　→　当前结论：' + result}
              </AdminText>
              {item.manuallyDecidedAfterCompletion ? (
                <Text
                  className={classes.mobileRouteStrong}
                  style={{ fontSize: tokens.mobileType.xs, fontWeight: '600' }}
                >
                  完成后人工改判
                </Text>
              ) : null}
            </View>
          ) : null}
          {item.evidence.map((evidence) => (
            <ReviewEvidence key={evidence.id} id={evidence.id} />
          ))}
        </View>
      </AdminCard>
      {focused ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            bottom: 2,
            left: 2,
            borderWidth: 2,
            borderRadius: 8,
            borderColor: colors.primary,
          }}
        />
      ) : null}
    </Pressable>
  );
}
