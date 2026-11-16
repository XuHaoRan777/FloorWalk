import { useState } from 'react';
import type { AdminSite, AdminUser } from '@libs/shared';
import { adminApi } from '../../../lib/api/admin';
import { PrimaryButton } from '../primary-button';
import {
  AdminCard,
  AdminField,
  AdminPage,
  AdminSelect,
  AdminText,
  ConfirmAction,
} from './admin-ui';
import { useAdminAction, useAdminResource } from './use-admin-data';

const loadAccounts = async () => {
  const [users, sites] = await Promise.all([
    adminApi.users(),
    adminApi.sites(),
  ]);
  return { users, sites };
};

type Draft = {
  id: string | null;
  displayName: string;
  loginName: string;
  siteId: string;
  password: string;
  role: AdminUser['role'];
};

export function AccountsScreen() {
  const resource = useAdminResource(loadAccounts, {
    users: [] as AdminUser[],
    sites: [] as AdminSite[],
  });
  const action = useAdminAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const updateDraft = (patch: Partial<Draft>) =>
    setDraft((current) => current && { ...current, ...patch });
  const replaceUser = (user: AdminUser) =>
    resource.setData((current) => ({
      ...current,
      users: current.users.map((entry) =>
        entry.id === user.id ? user : entry,
      ),
    }));

  function save() {
    if (!draft) return;
    void action.run(
      async () => {
        if (draft.id) {
          replaceUser(
            await adminApi.updateUser(draft.id, {
              displayName: draft.displayName.trim(),
              ...(draft.role === 'store_manager'
                ? { siteId: draft.siteId }
                : {}),
            }),
          );
        } else {
          const created = await adminApi.createUser({
            loginName: draft.loginName.trim(),
            displayName: draft.displayName.trim(),
            role: 'store_manager',
            siteId: draft.siteId,
            password: draft.password,
          });
          resource.setData((current) => ({
            ...current,
            users: [...current.users, created],
          }));
        }
        setDraft(null);
      },
      draft.id ? '账号已更新。' : '店长已创建，首次登录需修改密码。',
    );
  }

  return (
    <AdminPage
      title="账号"
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
    >
      {draft ? (
        <AdminCard>
          <AdminText>{draft.id ? '编辑账号' : '新建店长'}</AdminText>
          <AdminField
            label="昵称"
            value={draft.displayName}
            onChangeText={(displayName) => updateDraft({ displayName })}
            disabled={action.busy}
          />
          {!draft.id ? (
            <AdminField
              label="登录名（手机号或邮箱）"
              value={draft.loginName}
              onChangeText={(loginName) => updateDraft({ loginName })}
              disabled={action.busy}
            />
          ) : (
            <AdminText>{draft.loginName}</AdminText>
          )}
          {draft.role === 'store_manager' ? (
            <AdminSelect
              label="门店"
              value={draft.siteId}
              onChange={(siteId) => updateDraft({ siteId })}
              options={resource.data.sites.map((site) => ({
                value: site.id,
                label: `${site.code} · ${site.name}${site.active ? '' : '（已停用）'}`,
              }))}
              disabled={action.busy}
            />
          ) : null}
          {!draft.id ? (
            <AdminField
              label="初始密码（至少 8 位）"
              value={draft.password}
              onChangeText={(password) => updateDraft({ password })}
              password
              disabled={action.busy}
            />
          ) : null}
          <PrimaryButton
            disabled={
              action.busy ||
              !draft.displayName.trim() ||
              (draft.role === 'store_manager' && !draft.siteId) ||
              (!draft.id &&
                (!draft.loginName.trim() || draft.password.length < 8))
            }
            onPress={save}
          >
            {draft.id ? '保存账号' : '创建店长'}
          </PrimaryButton>
          <PrimaryButton
            disabled={action.busy}
            onPress={() => setDraft(null)}
            variant="secondary"
          >
            取消编辑
          </PrimaryButton>
        </AdminCard>
      ) : resetUser ? (
        <AdminCard>
          <AdminText>重置密码：{resetUser.displayName}</AdminText>
          <AdminField
            label="新密码（至少 8 位）"
            value={newPassword}
            onChangeText={setNewPassword}
            password
            disabled={action.busy}
          />
          <PrimaryButton
            disabled={action.busy || newPassword.length < 8}
            onPress={() =>
              void action.run(async () => {
                await adminApi.resetPassword(resetUser.id, newPassword);
                replaceUser({ ...resetUser, mustChangePassword: true });
                setResetUser(null);
                setNewPassword('');
              }, '密码已重置，下次登录需修改密码。')
            }
          >
            确认重置密码
          </PrimaryButton>
          <PrimaryButton
            disabled={action.busy}
            onPress={() => {
              setResetUser(null);
              setNewPassword('');
            }}
            variant="secondary"
          >
            取消重置
          </PrimaryButton>
        </AdminCard>
      ) : (
        <>
          <PrimaryButton
            disabled={resource.loading || action.busy}
            onPress={() =>
              setDraft({
                id: null,
                displayName: '',
                loginName: '',
                siteId: '',
                password: '',
                role: 'store_manager',
              })
            }
          >
            新建店长
          </PrimaryButton>
          {!resource.loading && !resource.data.users.length ? (
            <AdminText>暂无账号</AdminText>
          ) : null}
          {resource.data.users.map((user) => (
            <AdminCard key={user.id} testID={`account-${user.id}`}>
              <AdminText>{user.displayName}</AdminText>
              <AdminText>{user.loginName}</AdminText>
              <AdminText>
                {user.role === 'admin' ? '管理员' : '店长'} ·{' '}
                {user.site?.name ?? '不绑定门店'}
              </AdminText>
              <AdminText>
                {user.disabled
                  ? '已停用'
                  : user.mustChangePassword
                    ? '待首次改密'
                    : '启用'}
              </AdminText>
              <PrimaryButton
                disabled={action.busy}
                variant="secondary"
                onPress={() =>
                  setDraft({
                    id: user.id,
                    displayName: user.displayName,
                    loginName: user.loginName,
                    siteId: user.site?.id ?? '',
                    password: '',
                    role: user.role,
                  })
                }
              >
                编辑
              </PrimaryButton>
              <PrimaryButton
                disabled={action.busy}
                variant="secondary"
                onPress={() => {
                  setResetUser(user);
                  setNewPassword('');
                }}
              >
                重置密码
              </PrimaryButton>
              <ConfirmAction
                label={user.disabled ? '重新启用' : '停用'}
                detail={`确定${user.disabled ? '重新启用' : '停用'}「${user.displayName}」？`}
                disabled={action.busy}
                onConfirm={() =>
                  void action.run(
                    async () =>
                      replaceUser(
                        await adminApi.updateUser(user.id, {
                          disabled: !user.disabled,
                        }),
                      ),
                    '账号状态已更新。',
                  )
                }
              />
            </AdminCard>
          ))}
        </>
      )}
    </AdminPage>
  );
}
