import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTabColors } from './use-tab-colors';

type EmptyIllustrationVariant = 'today' | 'template' | 'notification';

export function EmptyIllustration({
  variant,
}: {
  variant: EmptyIllustrationVariant;
}) {
  const colors = useTabColors();
  const stroke = colors.border;
  const block = colors.raised;

  return (
    <Svg width={128} height={96} viewBox="0 0 160 120" fill="none">
      {variant === 'today' ? (
        <>
          <Path
            d="M72 104H30a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6h100a6 6 0 0 1 6 6v76a6 6 0 0 1-6 6H88"
            stroke={stroke}
            strokeWidth={2}
          />
          <Rect x={36} y={28} width={32} height={12} rx={3} fill={block} />
          <Rect x={84} y={28} width={40} height={6} rx={3} fill={block} />
          <Rect x={84} y={44} width={40} height={6} rx={3} fill={block} />
          <Rect x={84} y={60} width={40} height={6} rx={3} fill={block} />
          <Path
            d="M80 116V84M112 84H48V56"
            stroke={colors.primary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={48} cy={56} r={4.5} fill={colors.accent} />
          <Circle cx={80} cy={84} r={4.5} fill={colors.accent} />
          <Circle cx={112} cy={84} r={4.5} fill={colors.accent} />
        </>
      ) : null}
      {variant === 'template' ? (
        <>
          <Rect
            x={40}
            y={12}
            width={80}
            height={96}
            rx={6}
            stroke={stroke}
            strokeWidth={2}
          />
          <Path
            d="M56 32V92"
            stroke={colors.primary}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Circle cx={56} cy={32} r={4.5} fill={colors.accent} />
          <Circle cx={56} cy={52} r={4.5} fill={colors.accent} />
          <Circle cx={56} cy={72} r={4.5} fill={colors.accent} />
          <Rect x={68} y={29} width={40} height={6} rx={3} fill={block} />
          <Rect x={68} y={49} width={32} height={6} rx={3} fill={block} />
          <Rect x={68} y={69} width={36} height={6} rx={3} fill={block} />
          <Circle cx={56} cy={92} r={7} fill={colors.primary} />
          <Path
            d="M56 88.5v7M52.5 92h7"
            stroke={colors.primaryForeground}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <Rect x={68} y={89} width={28} height={6} rx={3} fill={block} />
        </>
      ) : null}
      {variant === 'notification' ? (
        <>
          <Rect
            x={24}
            y={16}
            width={112}
            height={88}
            rx={6}
            stroke={stroke}
            strokeWidth={2}
          />
          {Array.from({ length: 24 }, (_, index) => {
            const row = Math.floor(index / 6);
            const column = index % 6;
            const cx = 40 + column * 16;
            const cy = 36 + row * 16;
            if (cx === 88 && cy === 52) return null;
            return (
              <Circle key={index} cx={cx} cy={cy} r={1.75} fill={stroke} />
            );
          })}
          <Circle
            cx={88}
            cy={52}
            r={10}
            stroke={colors.primary}
            strokeWidth={2}
          />
          <Circle cx={88} cy={52} r={4} fill={colors.primary} />
        </>
      ) : null}
    </Svg>
  );
}
