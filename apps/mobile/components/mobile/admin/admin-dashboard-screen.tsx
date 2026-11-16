import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { classes, styles } from '../styles';
import { AdminCard, AdminPage, AdminText } from './admin-ui';
import { DashboardTrend } from './dashboard-trend';
import { percentage, scoreLabel } from './dashboard-format';
import { useAdminResource } from './use-admin-data';
import { useAdminFocus } from './use-admin-focus';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={selected ? classes.primaryButton : classes.secondaryButton}
      onPress={onPress}
      style={[styles.assessmentOption, { justifyContent: 'center' }]}
    >
      <Text
        className={
          selected ? classes.primaryButtonText : classes.secondaryButtonText
        }
        style={styles.buttonText}
      >
        {label}
      </Text>
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
    <AdminCard testID="admin-dashboard-sites">
      <AdminText>门店统计</AdminText>
      {data.summary.sites.length === 0 ? <AdminText>暂无门店</AdminText> : null}
      {data.summary.sites.map(({ site, metrics }) => {
        const latest = data.latestSites[site.id];
        return (
          <AdminCard key={site.id} testID={`site-${site.id}`}>
            <AdminText>{`${site.name} · ${site.code}${site.active ? '' : ' · 已停用'}`}</AdminText>
            {showMetrics ? (
              <>
                <AdminText>{`完成率 ${percentage(metrics.completionRate)} · ${metrics.completed}/${metrics.expected}`}</AdminText>
                <AdminText>{`逾期 ${metrics.overdue} · 自检准确率 ${percentage(data.siteChecks[site.id]?.accuracy ?? null)}`}</AdminText>
                <AdminText>{`平均分 ${scoreLabel(metrics.averageScore)}`}</AdminText>
              </>
            ) : null}
            <AdminText>{`最近分数 ${latest?.latestScore == null ? '暂无' : scoreLabel(latest.latestScore)}`}</AdminText>
            <AdminText>{`最近判定 ${latest?.latestStatus ? statusLabels[latest.latestStatus] : '暂无记录'}`}</AdminText>
          </AdminCard>
        );
      })}
    </AdminCard>
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

  return (
    <AdminPage
      title="总部看板"
      loading={resource.loading}
      error={resource.error}
      onRefresh={() => void resource.load()}
    >
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
          <AdminText>{`${data.summary.from} 至 ${data.summary.to} · ${data.summary.timezone}`}</AdminText>
          {data.summary.overall.expected === 0 ? (
            <>
              <AdminText>{`${label}暂无数据`}</AdminText>
              <Sites data={data} showMetrics={false} />
            </>
          ) : (
            <>
              <AdminCard testID="admin-dashboard-summary">
                <AdminText>{`完成率 ${percentage(data.summary.overall.completionRate)}`}</AdminText>
                <AdminText>{`逾期任务 ${data.summary.overall.overdue}`}</AdminText>
                <AdminText>{`自检准确率 ${percentage(data.accuracy)}`}</AdminText>
                <AdminText>{`平均分 ${scoreLabel(data.summary.overall.averageScore)}`}</AdminText>
                <AdminText>{`${label}应完成 ${data.summary.overall.expected} 项，截止前交齐 ${data.summary.overall.completed} 项；平均分仅计已判定任务，无样本显示 —。`}</AdminText>
              </AdminCard>
              <View
                accessibilityLabel="统计维度"
                style={{ flexDirection: 'row', gap: 8 }}
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
                <AdminCard testID="admin-dashboard-managers">
                  <AdminText>店长排行榜</AdminText>
                  <AdminText>
                    按提交条目数排序；通过率计已判定条目，自检准确率归首次上传人。
                  </AdminText>
                  {data.summary.managers.length === 0 ? (
                    <AdminText>{`${label}暂无店长提交`}</AdminText>
                  ) : null}
                  {data.summary.managers.map((manager, index) => (
                    <AdminCard
                      key={manager.id}
                      testID={`manager-${manager.id}`}
                    >
                      <AdminText>{`${index + 1}. ${manager.displayName}`}</AdminText>
                      <AdminText>{`提交条目数 ${manager.submittedItems}`}</AdminText>
                      <AdminText>{`通过率 ${percentage(manager.passRate)}`}</AdminText>
                      <AdminText>{`自检准确率 ${percentage(data.managerChecks[manager.id]?.accuracy ?? null)}`}</AdminText>
                    </AdminCard>
                  ))}
                </AdminCard>
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
