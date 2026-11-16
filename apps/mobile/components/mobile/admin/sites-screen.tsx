import { useState } from 'react';
import type { AdminSite } from '@libs/shared';
import { adminApi } from '../../../lib/api/admin';
import { PrimaryButton } from '../primary-button';
import {
  AdminCard,
  AdminField,
  AdminPage,
  AdminText,
  ConfirmAction,
} from './admin-ui';
import { useAdminAction, useAdminResource } from './use-admin-data';

export function SitesScreen() {
  const resource = useAdminResource(adminApi.sites, [] as AdminSite[]);
  const action = useAdminAction();
  const [draft, setDraft] = useState<{
    id: string | null;
    code: string;
    name: string;
  } | null>(null);
  return (
    <AdminPage
      title="门店"
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
    >
      {draft ? (
        <AdminCard>
          <AdminText>{draft.id ? '门店改名' : '新建门店'}</AdminText>
          {!draft.id ? (
            <AdminField
              label="门店编码"
              value={draft.code}
              onChangeText={(code) => setDraft({ ...draft, code })}
              disabled={action.busy}
            />
          ) : (
            <AdminText>{draft.code}</AdminText>
          )}
          <AdminField
            label="门店名称"
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            disabled={action.busy}
          />
          <PrimaryButton
            disabled={action.busy || !draft.name.trim() || !draft.code.trim()}
            onPress={() =>
              void action.run(
                async () => {
                  if (draft.id) {
                    const updated = await adminApi.updateSite(draft.id, {
                      name: draft.name.trim(),
                    });
                    resource.setData((current) =>
                      current.map((site) =>
                        site.id === updated.id ? { ...site, ...updated } : site,
                      ),
                    );
                  } else {
                    const created = await adminApi.createSite({
                      code: draft.code.trim(),
                      name: draft.name.trim(),
                    });
                    resource.setData((current) => [
                      ...current,
                      { ...created, storeManagers: [] },
                    ]);
                  }
                  setDraft(null);
                },
                draft.id ? '门店名称已更新。' : '门店已创建。',
              )
            }
          >
            {draft.id ? '保存名称' : '创建门店'}
          </PrimaryButton>
          <PrimaryButton
            disabled={action.busy}
            onPress={() => setDraft(null)}
            variant="secondary"
          >
            取消编辑
          </PrimaryButton>
        </AdminCard>
      ) : (
        <>
          <PrimaryButton
            disabled={resource.loading || action.busy}
            onPress={() => setDraft({ id: null, code: '', name: '' })}
          >
            新建门店
          </PrimaryButton>
          {!resource.loading && !resource.data.length ? (
            <AdminText>暂无门店</AdminText>
          ) : null}
          {resource.data.map((site) => (
            <AdminCard key={site.id} testID={`site-${site.id}`}>
              <AdminText>{site.name}</AdminText>
              <AdminText>
                {site.code} · {site.active ? '启用' : '已停用'}
              </AdminText>
              <AdminText>
                店长：
                {site.storeManagers
                  .map((manager) => manager.displayName)
                  .join('、') || '暂无店长'}
              </AdminText>
              <PrimaryButton
                disabled={action.busy}
                variant="secondary"
                onPress={() =>
                  setDraft({ id: site.id, code: site.code, name: site.name })
                }
              >
                改名
              </PrimaryButton>
              <ConfirmAction
                label={site.active ? '停用' : '重新启用'}
                detail={
                  site.active
                    ? `停用「${site.name}」后，店长将不能新建巡检。`
                    : `重新启用「${site.name}」？`
                }
                disabled={action.busy}
                onConfirm={() =>
                  void action.run(async () => {
                    const updated = await adminApi.updateSite(site.id, {
                      active: !site.active,
                    });
                    resource.setData((current) =>
                      current.map((entry) =>
                        entry.id === site.id ? { ...entry, ...updated } : entry,
                      ),
                    );
                  }, '门店状态已更新。')
                }
              />
            </AdminCard>
          ))}
        </>
      )}
    </AdminPage>
  );
}
