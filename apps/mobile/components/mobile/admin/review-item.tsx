import { Pressable, View } from 'react-native';
import { useState } from 'react';
import type { TaskReviewItem } from '@libs/shared';
import { MobileStatusTag, MobileText } from '../manager-ui';
import { AdminCard } from './admin-ui';
import { ReviewEvidence } from './review-evidence';
import { reviewTime } from './review-format';
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
            <MobileText
              role="number"
              size="xs"
              tone="primary"
              style={[
                { fontWeight: '600' },
                selected && { color: colors.mobileSurface },
              ]}
            >
              {String(item.position).padStart(2, '0')}
            </MobileText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <MobileText role="fixed" size="base">
              {item.title + (item.critical ? ' · 严重项' : '')}
            </MobileText>
            <MobileText size="xs" tone="muted">
              {item.minPhotoCount > 0
                ? '至少 ' + item.minPhotoCount + ' 张照片'
                : '可不上传照片，需填写备注'}
            </MobileText>
          </View>
          <MobileStatusTag
            status={
              item.result === 'pass'
                ? 'completed'
                : item.result === 'fail'
                  ? 'failed'
                  : item.result === 'rework'
                    ? 'rework'
                    : 'pending'
            }
            label={result + (item.incomplete ? ' · 未完成' : '')}
          />
        </View>

        <View style={{ gap: 5, paddingLeft: 38 }}>
          <MobileText size="xs" tone="muted">
            {(item.uploadedByName ?? '系统') +
              ' · 上传于 ' +
              reviewTime(item.uploadedAt)}
          </MobileText>
          {item.selfAssessment ? (
            <MobileText size="xs" tone="muted">
              {'自评：' + (item.selfAssessment === 'pass' ? '通过' : '不通过')}
            </MobileText>
          ) : null}
          {item.acceptanceCriteria ? (
            <MobileText size="sm">{'验收要点：' + item.acceptanceCriteria}</MobileText>
          ) : null}
          {item.aiReason ? (
            <MobileText size="sm">{'AI 理由：' + item.aiReason}</MobileText>
          ) : null}
          {item.lastReworkReason ? (
            <View
              style={{
                borderLeftWidth: 2,
                borderLeftColor: colors.mobileRoute,
                paddingLeft: 8,
              }}
            >
              <MobileText size="sm">
                {'打回理由：' + item.lastReworkReason}
              </MobileText>
            </View>
          ) : null}
          {item.note ? (
            <MobileText size="sm">{'备注：' + item.note}</MobileText>
          ) : null}
          {hasHistory && firstResult ? (
            <View
              style={{
                gap: 4,
                paddingTop: 7,
                borderTopWidth: 1,
                borderTopColor: colors.mobileBorder,
              }}
            >
              <MobileText size="xs" tone="muted">
                {'首次结论：' + firstResult + '　→　当前结论：' + result}
              </MobileText>
              {item.manuallyDecidedAfterCompletion ? (
                <MobileText role="fixed" size="xs" tone="primary">
                  完成后人工改判
                </MobileText>
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
