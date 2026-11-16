import { useState } from 'react';
import {
  addScheduleSkipsRequestSchema,
  type AdminSchedule,
  type AdminSiteSchedule,
} from '@libs/shared';
import { adminApi } from '../../../lib/api/admin';
import { PrimaryButton } from '../primary-button';
import { AdminDateTimeField } from './admin-datetime-field';
import {
  AdminCard,
  AdminField,
  AdminPage,
  AdminSelect,
  AdminText,
  AdminToggle,
  ConfirmAction,
} from './admin-ui';
import { useAdminAction, useAdminResource } from './use-admin-data';

type SiteScheduleData = {
  sites: AdminSiteSchedule[];
  schedules: AdminSchedule[];
};

async function loadSiteSchedules(): Promise<SiteScheduleData> {
  const [sites, schedules] = await Promise.all([
    adminApi.siteSchedules(),
    adminApi.schedules(),
  ]);
  return { sites, schedules };
}

export function SiteSchedulesScreen() {
  const resource = useAdminResource(loadSiteSchedules, {
    sites: [] as AdminSiteSchedule[],
    schedules: [] as AdminSchedule[],
  });
  const action = useAdminAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scheduleId, setScheduleId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const disabled = resource.loading || action.busy;
  const batchDisabled = disabled || !selectedIds.length;

  function assignSchedule() {
    setValidationError(null);
    void action.run(async () => {
      const sites = await adminApi.assignSchedule({
        siteIds: selectedIds,
        scheduleId: scheduleId || null,
      });
      resource.setData((current) => ({ ...current, sites }));
    }, `已为 ${selectedIds.length} 家门店更新方案。`);
  }

  function addSkips() {
    const parsed = addScheduleSkipsRequestSchema.safeParse({
      siteIds: selectedIds,
      startsOn,
      endsOn,
      note: note || null,
    });
    if (!parsed.success) {
      setValidationError('请选择有效的起止日期，结束日期不能早于开始日期。');
      return;
    }
    setValidationError(null);
    void action.run(async () => {
      const sites = await adminApi.addScheduleSkips(parsed.data);
      resource.setData((current) => ({ ...current, sites }));
    }, `已为 ${selectedIds.length} 家门店添加跳过日期。`);
  }

  function deleteSkip(id: string) {
    setValidationError(null);
    void action.run(async () => {
      await adminApi.deleteScheduleSkip(id);
      resource.setData((current) => ({
        ...current,
        sites: current.sites.map((site) => ({
          ...site,
          skippedRanges: site.skippedRanges.filter((range) => range.id !== id),
        })),
      }));
    }, '跳过日期区间已删除。');
  }

  return (
    <AdminPage
      title="门店日程安排"
      loading={resource.loading}
      busy={action.busy}
      error={validationError ?? action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
    >
      <AdminText>
        已选择 {selectedIds.length} 家门店。先选择下方门店，再批量设置。
      </AdminText>
      <AdminCard>
        <AdminText>批量选用方案</AdminText>
        <AdminSelect
          label="选用方案"
          value={scheduleId}
          onChange={setScheduleId}
          options={resource.data.schedules.map((schedule) => ({
            value: schedule.id,
            label: schedule.name,
          }))}
          disabled={batchDisabled}
        />
        <AdminText>
          方案留空（请选择）表示不选用方案，应用后会取消所选门店的方案。
        </AdminText>
        {!resource.loading && !resource.data.schedules.length ? (
          <AdminText>暂无方案，请先到「日程方案」页创建。</AdminText>
        ) : null}
        <PrimaryButton disabled={batchDisabled} onPress={assignSchedule}>
          应用方案
        </PrimaryButton>
      </AdminCard>
      <AdminCard>
        <AdminText>批量添加跳过日期</AdminText>
        <AdminDateTimeField
          label="跳过开始日期"
          mode="date"
          value={startsOn}
          onChange={(value) => {
            setStartsOn(value);
            setValidationError(null);
          }}
          disabled={batchDisabled}
        />
        <AdminDateTimeField
          label="跳过结束日期"
          mode="date"
          value={endsOn}
          onChange={(value) => {
            setEndsOn(value);
            setValidationError(null);
          }}
          disabled={batchDisabled}
        />
        <AdminField
          label="跳过备注（可选）"
          value={note}
          onChangeText={setNote}
          disabled={batchDisabled}
        />
        <AdminText>日期含起止两天，可只选一天；重叠区间会分别保留。</AdminText>
        <PrimaryButton disabled={batchDisabled} onPress={addSkips}>
          添加跳过日期
        </PrimaryButton>
      </AdminCard>
      {!resource.loading && !resource.data.sites.length ? (
        <AdminText>暂无门店，请先到「门店」页创建。</AdminText>
      ) : null}
      {resource.data.sites.map((site) => (
        <AdminCard key={site.siteId} testID={`site-schedule-${site.siteId}`}>
          <AdminToggle
            label={`选择门店 ${site.siteCode}`}
            value={selectedIds.includes(site.siteId)}
            onChange={(selected) =>
              setSelectedIds((current) =>
                selected
                  ? [...current, site.siteId]
                  : current.filter((id) => id !== site.siteId),
              )
            }
            disabled={disabled}
          />
          <AdminText>{site.siteName}</AdminText>
          <AdminText>
            {site.siteCode}
            {!site.active ? ' · 已停用' : ''}
          </AdminText>
          <AdminText>所选方案：{site.scheduleName ?? '未选用方案'}</AdminText>
          {!site.skippedRanges.length ? (
            <AdminText>无跳过区间</AdminText>
          ) : (
            site.skippedRanges.map((range) => (
              <AdminCard key={range.id}>
                <AdminText>
                  {range.startsOn} 至 {range.endsOn}
                </AdminText>
                {range.note ? <AdminText>{range.note}</AdminText> : null}
                <ConfirmAction
                  label="删除跳过区间"
                  detail={`确定删除「${site.siteName}」的 ${range.startsOn} 至 ${range.endsOn} 跳过区间？`}
                  disabled={disabled}
                  onConfirm={() => deleteSkip(range.id)}
                />
              </AdminCard>
            ))
          )}
        </AdminCard>
      ))}
    </AdminPage>
  );
}
