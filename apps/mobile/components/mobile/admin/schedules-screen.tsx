import { useRef, useState } from 'react';
import {
  scheduleDefinitionSchema,
  type AdminSchedule,
  type ScheduleDay,
  type ScheduleTask,
} from '@libs/shared';
import { adminApi, type AdminTemplate } from '../../../lib/api/admin';
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

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
type DraftTask = ScheduleTask & { key: string };
type DraftDay = Omit<ScheduleDay, 'tasks'> & { tasks: DraftTask[] };
type Draft = { id: string | null; name: string; days: DraftDay[] };
const loadSchedules = async () => {
  const [schedules, templates] = await Promise.all([
    adminApi.schedules(),
    adminApi.templates(),
  ]);
  return { schedules, templates };
};

export function SchedulesScreen() {
  const resource = useAdminResource(loadSchedules, {
    schedules: [] as AdminSchedule[],
    templates: [] as AdminTemplate[],
  });
  const action = useAdminAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [weekday, setWeekday] = useState('1');
  const nextKey = useRef(0);
  const edit = (schedule?: AdminSchedule) => {
    setWeekday('1');
    setDraft({
      id: schedule?.id ?? null,
      name: schedule?.name ?? '',
      days: Array.from({ length: 7 }, (_, index) => {
        const existing = schedule?.days.find(
          (day) => day.weekday === index + 1,
        );
        return {
          weekday: index + 1,
          enabled: existing?.enabled ?? true,
          tasks: (existing?.tasks ?? []).map((task) => ({
            ...task,
            key: `task-${nextKey.current++}`,
          })),
        };
      }),
    });
  };
  const day = draft?.days.find((entry) => entry.weekday === Number(weekday));
  const updateDay = (patch: Partial<DraftDay>) =>
    setDraft(
      (current) =>
        current && {
          ...current,
          days: current.days.map((entry) =>
            entry.weekday === Number(weekday) ? { ...entry, ...patch } : entry,
          ),
        },
    );
  const updateTask = (key: string, patch: Partial<ScheduleTask>) =>
    day &&
    updateDay({
      tasks: day.tasks.map((task) =>
        task.key === key ? { ...task, ...patch } : task,
      ),
    });
  const parsed = draft && scheduleDefinitionSchema.safeParse(draft);
  const save = () => {
    if (!draft || !parsed?.success) return;
    void action.run(async () => {
      const saved = draft.id
        ? await adminApi.updateSchedule(draft.id, parsed.data)
        : await adminApi.createSchedule(parsed.data);
      resource.setData((current) => ({
        ...current,
        schedules: draft.id
          ? current.schedules.map((schedule) =>
              schedule.id === saved.id ? saved : schedule,
            )
          : [...current.schedules, saved],
      }));
      setDraft(null);
    }, '日程方案已保存。');
  };
  return (
    <AdminPage
      title="日程方案"
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
    >
      {draft && day ? (
        <>
          <AdminCard>
            <AdminField
              label="方案名称"
              value={draft.name}
              onChangeText={(name) => setDraft({ ...draft, name })}
              disabled={action.busy}
            />
            <AdminText>
              时刻按商家时区执行。结束不晚于开始时，表示次日结束；停用某天后不安排任务。
            </AdminText>
            <AdminSelect
              label="编辑星期"
              value={weekday}
              onChange={(value) => value && setWeekday(value)}
              options={weekdays.map((label, index) => ({
                value: String(index + 1),
                label,
              }))}
              disabled={action.busy}
            />
            <AdminToggle
              label={`${weekdays[day.weekday - 1]}启用`}
              value={day.enabled}
              onChange={(enabled) => updateDay({ enabled })}
              disabled={action.busy}
            />
            <AdminText>{`本日 ${day.tasks.length} 条任务 · 已配置 ${draft.days.filter((entry) => entry.tasks.length).length} 天`}</AdminText>
          </AdminCard>
          {day.tasks.map((task, index) => {
            const label = `${weekdays[day.weekday - 1]}任务 ${index + 1}`;
            return (
              <AdminCard key={task.key}>
                <AdminSelect
                  label={`${label}模板`}
                  value={task.templateId}
                  onChange={(templateId) =>
                    updateTask(task.key, { templateId })
                  }
                  options={resource.data.templates.map((template) => ({
                    value: template.id,
                    label: template.name,
                  }))}
                  disabled={action.busy || !day.enabled}
                />
                <AdminDateTimeField
                  label={`${label}开始时刻`}
                  mode="time"
                  value={task.startsAt}
                  onChange={(startsAt) => updateTask(task.key, { startsAt })}
                  disabled={action.busy || !day.enabled}
                />
                <AdminDateTimeField
                  label={`${label}结束时刻`}
                  mode="time"
                  value={task.endsAt}
                  onChange={(endsAt) => updateTask(task.key, { endsAt })}
                  disabled={action.busy || !day.enabled}
                />
                <AdminText>
                  {task.endsAt <= task.startsAt ? '次日结束' : '当日结束'}
                </AdminText>
                <PrimaryButton
                  variant="secondary"
                  disabled={action.busy || !day.enabled}
                  onPress={() =>
                    updateDay({
                      tasks: day.tasks.filter(
                        (entry) => entry.key !== task.key,
                      ),
                    })
                  }
                >{`移除${label}`}</PrimaryButton>
              </AdminCard>
            );
          })}
          {!day.tasks.length ? (
            <AdminText>
              {day.enabled ? '这天暂无任务。' : '这天不安排任务。'}
            </AdminText>
          ) : null}
          {!resource.data.templates.length ? (
            <AdminText>暂无模板，请先创建模板再添加任务。</AdminText>
          ) : null}
          <PrimaryButton
            variant="secondary"
            disabled={
              action.busy || !day.enabled || !resource.data.templates.length
            }
            onPress={() =>
              updateDay({
                tasks: [
                  ...day.tasks,
                  {
                    key: `task-${nextKey.current++}`,
                    templateId: '',
                    startsAt: '09:00',
                    endsAt: '10:00',
                  },
                ],
              })
            }
          >
            添加任务
          </PrimaryButton>
          <PrimaryButton
            disabled={action.busy || !parsed?.success}
            onPress={save}
          >
            {draft.id ? '保存方案' : '创建方案'}
          </PrimaryButton>
          <PrimaryButton
            variant="secondary"
            disabled={action.busy}
            onPress={() => setDraft(null)}
          >
            取消编辑
          </PrimaryButton>
        </>
      ) : (
        <>
          <PrimaryButton
            disabled={resource.loading || action.busy}
            onPress={() => edit()}
          >
            新建方案
          </PrimaryButton>
          {!resource.loading && !resource.data.schedules.length ? (
            <AdminText>暂无日程方案</AdminText>
          ) : null}
          {resource.data.schedules.map((schedule) => (
            <AdminCard key={schedule.id} testID={`schedule-${schedule.id}`}>
              <AdminText>{schedule.name}</AdminText>
              <AdminText>{`${schedule.days.filter((entry) => entry.enabled).length} 天启用`}</AdminText>
              <PrimaryButton
                variant="secondary"
                disabled={action.busy}
                onPress={() => edit(schedule)}
              >
                编辑
              </PrimaryButton>
              <ConfirmAction
                label="删除方案"
                detail={`删除「${schedule.name}」？被门店选用的方案不能删除。`}
                disabled={action.busy}
                onConfirm={() =>
                  void action.run(async () => {
                    await adminApi.deleteSchedule(schedule.id);
                    resource.setData((current) => ({
                      ...current,
                      schedules: current.schedules.filter(
                        (entry) => entry.id !== schedule.id,
                      ),
                    }));
                  }, '日程方案已删除。')
                }
              />
            </AdminCard>
          ))}
        </>
      )}
    </AdminPage>
  );
}
