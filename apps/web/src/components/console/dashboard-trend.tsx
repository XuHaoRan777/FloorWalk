import { useId } from 'react';
import type { DashboardPeriodResponse } from '@libs/shared';
import { percentage, scoreLabel } from './dashboard-format';

export function DashboardTrend({
  dates,
}: {
  dates: DashboardPeriodResponse['dates'];
}) {
  const titleId = useId();
  const descriptionId = useId();
  const x = (index: number) =>
    52 + (index * 640) / Math.max(dates.length - 1, 1);
  const y = (value: number) => 222 - value * 1.8;
  const series = [
    {
      name: '完成率',
      color: 'var(--primary)',
      value: (day: (typeof dates)[number]) =>
        day.metrics.completionRate === null
          ? null
          : day.metrics.completionRate * 100,
    },
    {
      name: '平均分',
      color: 'var(--muted-foreground)',
      value: (day: (typeof dates)[number]) => day.metrics.averageScore,
    },
  ];
  return (
    <section aria-label="日期趋势">
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        {series.map((entry) => (
          <span key={entry.name} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
        ))}
      </div>
      <div className="rounded-md border bg-card p-4">
        <svg
          viewBox="0 0 720 270"
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="w-full"
        >
          <title id={titleId}>每日完成率与平均分折线图</title>
          <desc id={descriptionId}>
            纵轴为 0 至
            100，完成率单位为百分比，平均分单位为分；无任务或未判定的日期留空。逐日数值见下方表格。
          </desc>
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line
                x1="52"
                x2="692"
                y1={y(value)}
                y2={y(value)}
                stroke="var(--border)"
              />
              <text
                x="40"
                y={y(value) + 4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize="12"
              >
                {value}
              </text>
            </g>
          ))}
          {series.map((entry) => (
            <g key={entry.name} fill={entry.color} stroke={entry.color}>
              {dates.map((day, index) => {
                const value = entry.value(day);
                const previous =
                  index > 0 ? entry.value(dates[index - 1]) : null;
                return value === null ? null : (
                  <g key={day.date}>
                    {previous !== null && (
                      <line
                        x1={x(index - 1)}
                        y1={y(previous)}
                        x2={x(index)}
                        y2={y(value)}
                        strokeWidth="2"
                      />
                    )}
                    <circle cx={x(index)} cy={y(value)} r="3">
                      <title>
                        {day.date} {entry.name} {value.toFixed(1)}
                        {entry.name === '完成率' ? '%' : '分'}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </g>
          ))}
          {dates.map((day, index) =>
            index % Math.max(1, Math.ceil(dates.length / 7)) === 0 ||
            index === dates.length - 1 ? (
              <text
                key={day.date}
                x={x(index)}
                y="248"
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="12"
              >
                {day.date.slice(5)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="fw-data-table min-w-[32rem]">
          <caption className="sr-only">每日任务与分数统计</caption>
          <thead>
            <tr>
              <th>日期</th>
              <th className="text-right">已完成/应完成</th>
              <th className="text-right">完成率</th>
              <th className="text-right">逾期</th>
              <th className="text-right">平均分</th>
            </tr>
          </thead>
          <tbody>
            {dates.map(({ date, metrics }) => (
              <tr key={date}>
                <td className="tabular-nums">{date}</td>
                <td className="text-right tabular-nums">
                  {metrics.completed}/{metrics.expected}
                </td>
                <td className="text-right tabular-nums">
                  {percentage(metrics.completionRate)}
                </td>
                <td className="text-right tabular-nums">{metrics.overdue}</td>
                <td className="text-right tabular-nums">
                  {scoreLabel(metrics.averageScore)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
