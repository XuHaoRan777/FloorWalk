import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import type {
  DashboardPeriod,
  DashboardPeriodResponse,
  DashboardSitesResponse,
  SelfCheckStatsResponse,
} from '@libs/shared';
import {
  getDashboardSites,
  getPeriodDashboard,
  getSelfCheckStats,
} from '../../../lib/api/dashboard';
import { MobileEmptyState, MobileSurfaceCard } from '../manager-data-ui';
import { MobileText } from '../manager-ui';
import { AdminPage } from './admin-ui';
import { DashboardTrend } from './dashboard-trend';
import { percentage, scoreLabel } from './dashboard-format';
import { useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';
import tokens from '../../../../../packages/tokens/native.json';

type DashboardData = {
  summary: DashboardPeriodResponse;
  siteChecks: Record<string, SelfCheckStatsResponse>;
  managerChecks: Record<string, SelfCheckStatsResponse>;
  latestSites: Record<string, DashboardSitesResponse[number]>;
  accuracy: number | null;
};

async function loadDashboard(period: DashboardPeriod): Promise<DashboardData> {
  const [summary, latestSites] = await Promise.all([
    getPeriodDashboard(period),
    getDashboardSites(),
  ]);
  const range = { from: summary.from, to: summary.to };
  const [sites, managers] = await Promise.all([
    Promise.all(
      summary.sites.map(
        async ({ site }) =>
          [
            site.id,
            await getSelfCheckStats({ scope: 'site', id: site.id, ...range }),
          ] as const,
      ),
    ),
    Promise.all(
      summary.managers.map(
        async (manager) =>
          [
            manager.id,
            await getSelfCheckStats({
              scope: 'manager',
              id: manager.id,
              ...range,
            }),
          ] as const,
      ),
    ),
  ]);
  const counts = sites.reduce(
    (total, [, stats]) => ({
      samples: total.samples + stats.sampleCount,
      matching: total.matching + stats.matchingCount,
    }),
    { samples: 0, matching: 0 },
  );
  return {
    summary,
    siteChecks: Object.fromEntries(sites),
    managerChecks: Object.fromEntries(managers),
    latestSites: Object.fromEntries(
      latestSites.map((entry) => [entry.site.id, entry]),
    ),
    accuracy: counts.samples ? counts.matching / counts.samples : null,
  };
}

const statusLabels = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  passed: '已通过',
  rework: '已打回',
  failed: '不合格',
} as const;

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const selectedStyle = selected
    ? {
        backgroundColor: tokens.mobile.primarySoft,
        borderColor: tokens.mobile.primary,
      }
    : {
        backgroundColor: tokens.mobile.surface,
        borderColor: tokens.mobile.border,
      };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          borderRadius: tokens.mobileRadius.pill,
          borderWidth: 1,
          justifyContent: 'center',
          minHeight: 44,
          paddingHorizontal: 14,
        },
        selectedStyle,
        pressed && { backgroundColor: tokens.mobile.pressedBackground },
      ]}
    >
      <MobileText role="fixed" size="sm" tone={selected ? 'primary' : 'muted'}>
        {label}
      </MobileText>
    </Pressable>
  );
}

function Sites({
  data,
  showMetrics,
}: {
  data: DashboardData;
  showMetrics: boolean;
}) {
  return (
    <View style={{ gap: 10 }} testID="admin-dashboard-sites">
      <MobileText role="fixed" size="lg">
        门店统计
      </MobileText>
      {data.summary.sites.length === 0 ? (
        <MobileText size="sm" tone="muted">
          暂无门店
        </MobileText>
      ) : null}
      {data.summary.sites.map(({ site, metrics }) => {
        const latest = data.latestSites[site.id];
        return (
          <View key={site.id} testID={`site-${site.id}`}>
            <MobileSurfaceCard style={{ gap: 7 }}>
              <MobileText role="fixed" size="base">
                {`${site.name} · ${site.code}${site.active ? '' : ' · 已停用'}`}
              </MobileText>
            {showMetrics ? (
              <>
                  <MobileText size="sm">
                    {`完成率 ${percentage(metrics.completionRate)} · ${metrics.completed}/${metrics.expected}`}
                  </MobileText>
                  <MobileText size="sm">
                    {`逾期 ${metrics.overdue} · 自检准确率 ${percentage(data.siteChecks[site.id]?.accuracy ?? null)}`}
                  </MobileText>
                  <MobileText size="sm">
                    {`平均分 ${scoreLabel(metrics.averageScore)}`}
                  </MobileText>
              </>
            ) : null}
              <MobileText size="xs" tone="muted">
                {`最近分数 ${latest?.latestScore == null ? '暂无' : scoreLabel(latest.latestScore)} · 最近判定 ${latest?.latestStatus ? statusLabels[latest.latestStatus] : '暂无记录'}`}
              </MobileText>
            </MobileSurfaceCard>
          </View>
        );
      })}
    </View>
  );
}

export function AdminDashboardScreen() {
  const [period, setPeriod] = useState<DashboardPeriod>('week');
  const [dimension, setDimension] = useState<'site' | 'manager' | 'date'>(
    'site',
  );
  const fetcher = useCallback(() => loadDashboard(period), [period]);
  const resource = useAdminResource(fetcher, null as DashboardData | null);
  useAdminFocus(resource.load, true);
  const data =
    resource.data?.summary.period === period && !resource.error
      ? resource.data
      : null;
  const label = period === 'week' ? '本周' : '本月';
  const pageDate = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
  const metrics = data
    ? [
        {
          label: '完成率',
          value: percentage(data.summary.overall.completionRate),
        },
        { label: '逾期任务', value: String(data.summary.overall.overdue) },
        { label: '自检准确率', value: percentage(data.accuracy) },
        {
          label: '平均分',
          value: scoreLabel(data.summary.overall.averageScore),
        },
      ]
    : [];

  return (
    <AdminPage
      title="总部看板"
      loading={resource.loading}
      error={resource.error}
      homeHeader
      homeHeaderLabel="商家巡检管理"
      homeHeaderMeta={pageDate}
      showBack={false}
      visual="route"
      onRefresh={() => void resource.load()}
    >
      <MobileText size="sm" tone="muted">
        周度 / 月度
      </MobileText>
      <View
        accessibilityLabel="统计周期"
        style={{ flexDirection: 'row', gap: 8 }}
      >
        {(['week', 'month'] as const).map((value) => (
          <Choice
            key={value}
            label={value === 'week' ? '本周' : '本月'}
            selected={period === value}
            onPress={() => setPeriod(value)}
          />
        ))}
      </View>
      {data ? (
        <>
          <MobileText role="number" size="xs" tone="muted">
            {`${data.summary.from} 至 ${data.summary.to} · ${data.summary.timezone}`}
          </MobileText>
          {data.summary.overall.expected === 0 ? (
            <>
              <MobileEmptyState
                title={`${label}暂无数据`}
                description="选择其他统计周期查看巡检汇总。"
                icon={<BarChart3 color={tokens.mobile.primary} size={28} />}
              />
              <Sites data={data} showMetrics={false} />
            </>
          ) : (
            <>
              <View testID="admin-dashboard-summary">
                <MobileSurfaceCard
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
                >
                  {metrics.map(({ label: metricLabel, value }) => (
                    <View
                      key={metricLabel}
                      style={{ flexBasis: '46%', flexGrow: 1, gap: 4 }}
                    >
                      <MobileText role="fixed" size="xs" tone="muted">
                        {metricLabel}
                      </MobileText>
                      <MobileText role="number" size="2xl">
                        {value}
                      </MobileText>
                    </View>
                  ))}
                  <MobileText size="xs" tone="muted">
                    {`${label}应完成 ${data.summary.overall.expected} 项，截止前交齐 ${data.summary.overall.completed} 项；平均分仅计已判定任务，无样本显示 —。`}
                  </MobileText>
                </MobileSurfaceCard>
              </View>
              <View
                accessibilityLabel="统计维度"
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
              >
                {(
                  [
                    ['site', '门店'],
                    ['manager', '店长'],
                    ['date', '日期趋势'],
                  ] as const
                ).map(([value, title]) => (
                  <Choice
                    key={value}
                    label={title}
                    selected={dimension === value}
                    onPress={() => setDimension(value)}
                  />
                ))}
              </View>
              {dimension === 'site' ? <Sites data={data} showMetrics /> : null}
              {dimension === 'manager' ? (
                <View style={{ gap: 10 }} testID="admin-dashboard-managers">
                  <MobileText role="fixed" size="lg">
                    店长排行榜
                  </MobileText>
                  <MobileText size="xs" tone="muted">
                    按提交条目数排序；通过率计已判定条目，自检准确率归首次上传人。
                  </MobileText>
                  {data.summary.managers.length === 0 ? (
                    <MobileText size="sm" tone="muted">
                      {`${label}暂无店长提交`}
                    </MobileText>
                  ) : null}
                  {data.summary.managers.map((manager, index) => (
                    <View key={manager.id} testID={`manager-${manager.id}`}>
                      <MobileSurfaceCard style={{ gap: 5 }}>
                        <MobileText role="fixed" size="base">
                          {`${index + 1}. ${manager.displayName}`}
                        </MobileText>
                        <MobileText size="sm">
                          {`提交条目数 ${manager.submittedItems}`}
                        </MobileText>
                        <MobileText size="sm">
                          {`通过率 ${percentage(manager.passRate)}`}
                        </MobileText>
                        <MobileText size="sm">
                          {`自检准确率 ${percentage(data.managerChecks[manager.id]?.accuracy ?? null)}`}
                        </MobileText>
                      </MobileSurfaceCard>
                    </View>
                  ))}
                </View>
              ) : null}
              {dimension === 'date' ? (
                <DashboardTrend dates={data.summary.dates} />
              ) : null}
            </>
          )}
        </>
      ) : null}
    </AdminPage>
  );
}
