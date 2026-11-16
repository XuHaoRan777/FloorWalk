import type { DashboardPeriodResponse } from '@libs/shared';
import { Fragment } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTabColors } from '../use-tab-colors';
import { AdminCard, AdminText } from './admin-ui';
import { percentage, scoreLabel } from './dashboard-format';

export function DashboardTrend({
  dates,
}: {
  dates: DashboardPeriodResponse['dates'];
}) {
  const colors = useTabColors();
  const x = (index: number) =>
    16 + (index * 288) / Math.max(dates.length - 1, 1);
  const y = (value: number) => 136 - value * 1.2;
  const series = [
    {
      color: colors.accent,
      value: (day: (typeof dates)[number]) =>
        day.metrics.completionRate === null
          ? null
          : day.metrics.completionRate * 100,
    },
    {
      color: colors.mutedForeground,
      value: (day: (typeof dates)[number]) => day.metrics.averageScore,
    },
  ];

  return (
    <AdminCard testID="admin-dashboard-dates">
      <AdminText>每日完成率与平均分趋势</AdminText>
      <AdminText>完成率与平均分按 0–100 展示，具体数值见下方。</AdminText>
      <Svg
        accessibilityLabel="每日完成率与平均分折线图"
        accessibilityRole="image"
        height={150}
        viewBox="0 0 320 150"
        width="100%"
      >
        {[0, 25, 50, 75, 100].map((value) => (
          <Line
            key={value}
            x1={16}
            x2={304}
            y1={y(value)}
            y2={y(value)}
            stroke={colors.mutedForeground}
            strokeOpacity={0.2}
          />
        ))}
        {series.map((entry, seriesIndex) =>
          dates.map((day, index) => {
            const value = entry.value(day);
            const previous = index > 0 ? entry.value(dates[index - 1]) : null;
            return value === null ? null : (
              <Fragment key={`${seriesIndex}-${day.date}`}>
                {previous !== null ? (
                  <Line
                    x1={x(index - 1)}
                    y1={y(previous)}
                    x2={x(index)}
                    y2={y(value)}
                    stroke={entry.color}
                    strokeWidth={2}
                  />
                ) : null}
                <Circle cx={x(index)} cy={y(value)} r={3} fill={entry.color} />
              </Fragment>
            );
          }),
        )}
      </Svg>
      <AdminText>完成率 · 主色{'\u3000'}平均分 · 灰色</AdminText>
      {dates.map(({ date, metrics }) => (
        <AdminCard key={date} testID={`date-${date}`}>
          <AdminText>{date}</AdminText>
          <AdminText>{`已完成/应完成 ${metrics.completed}/${metrics.expected}`}</AdminText>
          <AdminText>{`完成率 ${percentage(metrics.completionRate)} · 逾期 ${metrics.overdue}`}</AdminText>
          <AdminText>{`平均分 ${scoreLabel(metrics.averageScore)}`}</AdminText>
        </AdminCard>
      ))}
    </AdminCard>
  );
}
