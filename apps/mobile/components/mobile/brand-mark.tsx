import Svg, { Circle, Path } from 'react-native-svg';
import { useTabColors } from './use-tab-colors';

export function BrandMark({ size = 24 }: { size?: number }) {
  const colors = useTabColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M9 25V8h15M9 16.5h6"
        stroke={colors.primary}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={20.5} cy={16.5} r={3.1} fill={colors.accent} />
    </Svg>
  );
}
