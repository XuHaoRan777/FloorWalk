import type { DashboardPeriodResponse } from '@libs/shared';
import { Fragment } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { MobileSurfaceCard } from '../manager-data-ui';
import { MobileText } from '../manager-ui';
import { percentage, scoreLabel } from './dashboard-format';
import tokens from '../../../../../packages/tokens/native.json';

export function DashboardTrend({
  dates,
}: {
  dates: DashboardPeriodResponse['dates'];
}) {
  const x = (index: number) =>
    16 + (index * 288) / Math.max(dates.length - 1, 1);
  const y = (value: number) => 136 - value * 1.2;
  const series = [
    {
      color: tokens.mobile.primary,
      value: (day: (typeof dates)[number]) =>
        day.metrics.completionRate === null
          ? null
          : day.metrics.completionRate * 100,
    },
    {
      color: tokens.mobile.mutedForeground,
      value: (day: (typeof dates)[number]) => day.metrics.averageScore,
    },
  ];

  return (
    <View testID="admin-dashboard-dates">
      <MobileSurfaceCard style={{ gap: 8 }}>
        <MobileText role="fixed" size="base">
          每日完成率与平均分趋势
        </MobileText>
        <MobileText size="xs" tone="muted">
          完成率与平均分按 0–100 展示，具体数值见下方。
        </MobileText>
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
              stroke={tokens.mobile.border}
              strokeOpacity={0.6}
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
                  <Circle
                    cx={x(index)}
                    cy={y(value)}
                    r={3}
                    fill={entry.color}
                  />
                </Fragment>
              );
            }),
          )}
        </Svg>
        <MobileText size="xs" tone="muted">
          完成率 · 主色 · 平均分 · 灰色
        </MobileText>
        {dates.map(({ date, metrics }) => (
          <View key={date} style={{ gap: 3 }} testID={`date-${date}`}>
            <MobileText role="number" size="sm">
              {date}
            </MobileText>
            <MobileText size="xs" tone="muted">
              {`已完成/应完成 ${metrics.completed}/${metrics.expected}`}
            </MobileText>
            <MobileText size="xs" tone="muted">
              {`完成率 ${percentage(metrics.completionRate)} · 逾期 ${metrics.overdue}`}
            </MobileText>
            <MobileText size="xs" tone="muted">
              {`平均分 ${scoreLabel(metrics.averageScore)}`}
            </MobileText>
          </View>
        ))}
      </MobileSurfaceCard>
    </View>
  );
}
