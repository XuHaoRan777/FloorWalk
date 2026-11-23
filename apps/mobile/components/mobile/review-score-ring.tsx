import { useEffect } from 'react';
import { Text, View } from 'react-native';
import type { TaskReview } from '@libs/shared';
import Svg, { Circle, G, Path } from 'react-native-svg';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import tokens from '../../../../packages/tokens/native.json';
import { useTabColors } from './use-tab-colors';

const center = 56;
const radius = 42;
const strokeWidth = 8;
const circumference = 2 * Math.PI * radius;
const gapDegrees = 10;
const capCoverageDegrees =
  (Math.asin(strokeWidth / (2 * radius)) * 180) / Math.PI;

type ReviewItem = TaskReview['items'][number];
type Tone = 'passed' | 'failed' | null;

function itemTone(item: ReviewItem): Tone {
  if (item.result === 'pass') return 'passed';
  if (
    item.result === 'pending' ||
    (item.incomplete && !item.manuallyDecidedAfterCompletion)
  )
    return null;
  return 'failed';
}

function polarPoint(angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: center + radius * Math.sin(radians),
    y: center - radius * Math.cos(radians),
  };
}

function arcPath(startAngle: number, endAngle: number) {
  const start = polarPoint(startAngle);
  const end = polarPoint(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M${start.x} ${start.y}A${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function ReviewScoreRing({
  task,
  playbackKey = 0,
}: {
  task: TaskReview;
  playbackKey?: number;
}) {
  const colors = useTabColors();
  const reduceMotion = useReducedMotion();
  const feedback = useSharedValue(1);
  const itemCount = task.items.length;
  const tones = task.items.map(itemTone);
  const decided = task.decidedAt !== null;
  const passed = task.inspectionStatus === 'passed';
  const lastScoredIndex = tones.reduce(
    (last, tone, index) => (tone ? index : last),
    -1,
  );
  const badgePoint =
    itemCount === 0
      ? polarPoint(0)
      : polarPoint((((lastScoredIndex + 1) * 360) / itemCount) % 360);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: feedback.get(),
    transform: [{ scale: 0.96 + feedback.get() * 0.04 }],
  }));

  useEffect(() => {
    if (playbackKey === 0) return;
    if (reduceMotion) {
      feedback.set(1);
      return;
    }
    feedback.set(0.7);
    feedback.set(
      withTiming(1, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [feedback, playbackKey, reduceMotion]);

  return (
    <Animated.View style={[{ alignSelf: 'center' }, animatedStyle]}>
      <View
        accessible
        accessibilityLabel={`审核评分${task.score === null ? '，待判定' : `${task.score} 分`}，${task.items.length} 项`}
        accessibilityRole="image"
        style={{
          width: 112,
          height: 112,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={112} height={112} viewBox="0 0 112 112">
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {tones.map((tone, index) => {
            if (!tone) return null;
            const step = 360 / itemCount;
            const inset =
              itemCount > 12 ? 0 : gapDegrees / 2 + capCoverageDegrees;
            const start = index * step + inset;
            const end = (index + 1) * step - inset;
            if (end <= start) return null;
            const segmentLength = (end - start) * (circumference / 360);
            const color = tone === 'passed' ? colors.primary : colors.danger;
            return itemCount > 12 ? (
              <Circle
                key={task.items[index]?.id}
                cx={center}
                cy={center}
                r={radius}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={[segmentLength, circumference - segmentLength]}
                rotation={start - 90}
                originX={center}
                originY={center}
                strokeLinecap="butt"
                fill="none"
              />
            ) : (
              <Path
                key={task.items[index]?.id}
                d={arcPath(start, index * step + step - inset)}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
          {decided ? (
            <G transform={`translate(${badgePoint.x} ${badgePoint.y})`}>
              <Circle
                r={11}
                fill={passed ? colors.successMark : colors.danger}
              />
              {passed ? (
                <Path
                  d="m-4 0.5 2.6 2.6 5.1-5.2"
                  stroke={colors.dangerForeground}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <>
                  <Path
                    d="M0-4v5"
                    stroke={colors.dangerForeground}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <Circle cy={4.2} r={1.1} fill={colors.dangerForeground} />
                </>
              )}
            </G>
          ) : null}
        </Svg>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', alignItems: 'center' }}
        >
          <Text
            style={{
              color: colors.primary,
              fontFamily: tokens.font.sans.semibold,
              fontSize: 24,
              lineHeight: 29,
            }}
          >
            {task.score ?? '—'}
          </Text>
          {task.score !== null ? (
            <Text
              style={{
                color: colors.muted,
                fontFamily: tokens.font.sans.regular,
                fontSize: 11,
              }}
            >
              分
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
