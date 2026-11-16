import { useState } from 'react';
import type { AiStandard } from '@libs/shared';
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

type StandardDraft = {
  id: string | null;
  name: string;
  prompt: string;
};

export function AiStandardsScreen() {
  const resource = useAdminResource(adminApi.aiStandards, [] as AiStandard[]);
  const action = useAdminAction();
  const [draft, setDraft] = useState<StandardDraft | null>(null);

  function save() {
    if (!draft) return;
    void action.run(
      async () => {
        const input = { name: draft.name.trim(), prompt: draft.prompt };
        const saved = draft.id
          ? await adminApi.updateAiStandard(draft.id, input)
          : await adminApi.createAiStandard(input);
        resource.setData((current) =>
          draft.id
            ? current.map((standard) =>
                standard.id === saved.id ? saved : standard,
              )
            : [...current, saved],
        );
        setDraft(null);
      },
      draft.id ? 'AI 标准已更新。' : 'AI 标准已创建。',
    );
  }

  return (
    <AdminPage
      title="AI 标准"
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
    >
      {draft ? (
        <AdminCard>
          <AdminText>{draft.id ? '编辑标准' : '新建标准'}</AdminText>
          <AdminField
            label="标准名称"
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            disabled={action.busy}
          />
          <AdminField
            label="提示词"
            value={draft.prompt}
            onChangeText={(prompt) => setDraft({ ...draft, prompt })}
            maxLength={4000}
            multiline
            disabled={action.busy}
          />
          <PrimaryButton
            disabled={
              action.busy ||
              resource.loading ||
              !draft.name.trim() ||
              !draft.prompt.length
            }
            onPress={save}
          >
            {draft.id ? '保存标准' : '创建标准'}
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
            onPress={() => setDraft({ id: null, name: '', prompt: '' })}
          >
            新建标准
          </PrimaryButton>
          {!resource.loading && !resource.data.length ? (
            <AdminText>暂无 AI 标准</AdminText>
          ) : null}
          {resource.data.map((standard) => (
            <AdminCard key={standard.id} testID={`standard-${standard.id}`}>
              <AdminText>{standard.name}</AdminText>
              <PrimaryButton
                disabled={resource.loading || action.busy}
                variant="secondary"
                onPress={() =>
                  setDraft({
                    id: standard.id,
                    name: standard.name,
                    prompt: standard.prompt,
                  })
                }
              >
                编辑
              </PrimaryButton>
              <ConfirmAction
                label="删除"
                detail={`确定删除 AI 标准「${standard.name}」？`}
                disabled={resource.loading || action.busy}
                onConfirm={() =>
                  void action.run(async () => {
                    await adminApi.deleteAiStandard(standard.id);
                    resource.setData((current) =>
                      current.filter((entry) => entry.id !== standard.id),
                    );
                  }, 'AI 标准已删除。')
                }
              />
            </AdminCard>
          ))}
        </>
      )}
    </AdminPage>
  );
}
