import { useRef, useState } from 'react';
import type { AiStandard, QuickSetupTemplateRequest } from '@libs/shared';
import { adminApi, type AdminTemplate } from '../../../lib/api/admin';
import { Pressable, Text, View } from 'react-native';
import tokens from '../../../../../packages/tokens/native.json';
import { EmptyIllustration } from '../empty-illustration';
import { PrimaryButton } from '../primary-button';
import {
  AdminField,
  AdminPage,
  AdminSelect,
  AdminText,
  AdminToggle,
} from './admin-ui';
import { useAdminAction, useAdminResource } from './use-admin-data';
import { classes, styles } from '../styles';
import { useTabColors } from '../use-tab-colors';

type DraftItem = {
  key: string;
  title: string;
  minPhotoCount: string;
  acceptanceCriteria: string;
  critical: boolean;
};
type Draft = {
  id: string | null;
  name: string;
  aiEnabled: boolean;
  aiStandardId: string;
  items: DraftItem[];
};
const quickOptions = [
  ['coffee', '咖啡店'],
  ['restaurant', '餐馆'],
  ['florist', '花店'],
] as const;
const loadTemplates = () =>
  Promise.all([adminApi.templates(), adminApi.aiStandards()]).then(
    ([templates, standards]) => ({ templates, standards }),
  );

export function TemplatesScreen() {
  const resource = useAdminResource(loadTemplates, {
    templates: [] as AdminTemplate[],
    standards: [] as AiStandard[],
  });
  const action = useAdminAction();
  const colors = useTabColors();
  const [draft, setDraft] = useState<Draft | null>(null);
  const nextKey = useRef(0);
  const newItem = (): DraftItem => ({
    key: `new-${nextKey.current++}`,
    title: '',
    minPhotoCount: '0',
    acceptanceCriteria: '',
    critical: false,
  });
  const edit = (template: AdminTemplate) =>
    setDraft({
      ...template,
      aiStandardId: template.aiStandardId ?? '',
      items: template.items.map((item) => ({
        ...item,
        key: item.id,
        minPhotoCount: String(item.minPhotoCount),
      })),
    });
  const update = (patch: Partial<Draft>) =>
    setDraft((current) => current && { ...current, ...patch });
  const updateItem = (index: number, patch: Partial<DraftItem>) =>
    draft &&
    update({
      items: draft.items.map((item, itemIndex) =>
        index === itemIndex ? { ...item, ...patch } : item,
      ),
    });
  const moveItem = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const items = [...draft.items];
    [items[index], items[index + direction]] = [
      items[index + direction],
      items[index],
    ];
    update({ items });
  };
  const quickSetup = (kind: QuickSetupTemplateRequest['kind']) =>
    void action.run(async () => {
      const result = await adminApi.quickSetupTemplate({ kind });
      resource.setData((current) => ({
        templates: [...current.templates, result.template],
        standards: [...current.standards, result.standard],
      }));
    }, '模板和 AI 审核标准已生成，可在列表中编辑。');
  const invalid =
    !draft ||
    !draft.name.trim() ||
    !draft.items.length ||
    (draft.aiEnabled && !draft.aiStandardId) ||
    draft.items.some(
      (item) =>
        !item.title.trim() ||
        !/^(?:[0-9]|10)$/.test(item.minPhotoCount) ||
        item.acceptanceCriteria.length > 500,
    );
  function save() {
    if (!draft || invalid) return;
    void action.run(async () => {
      const input = {
        name: draft.name.trim(),
        aiEnabled: draft.aiEnabled,
        aiStandardId: draft.aiStandardId || null,
        items: draft.items.map((item, index) => ({
          position: index + 1,
          title: item.title.trim(),
          minPhotoCount: Number(item.minPhotoCount),
          acceptanceCriteria: item.acceptanceCriteria,
          critical: item.critical,
        })),
      };
      const saved = draft.id
        ? await adminApi.updateTemplate(draft.id, input)
        : await adminApi.createTemplate(input);
      resource.setData((current) => ({
        ...current,
        templates: draft.id
          ? current.templates.map((template) =>
              template.id === saved.id ? saved : template,
            )
          : [...current.templates, saved],
      }));
      setDraft(null);
    }, '模板已保存。');
  }
  return (
    <AdminPage
      title={draft ? '模板编辑' : '模板'}
      loading={resource.loading}
      busy={action.busy}
      error={action.error ?? resource.error}
      message={action.message}
      onRefresh={() => void resource.load()}
      fixedFooter={
        draft ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                disabled={action.busy}
                onPress={() => setDraft(null)}
                variant="secondary"
              >
                取消
              </PrimaryButton>
            </View>
            <View style={{ flex: 1.4 }}>
              <PrimaryButton disabled={action.busy || invalid} onPress={save}>
                {action.busy ? '保存中…' : draft.id ? '保存模板' : '创建模板'}
              </PrimaryButton>
            </View>
          </View>
        ) : undefined
      }
    >
      {draft ? (
        <>
          <View style={{ gap: tokens.space.md }}>
            <AdminField
              label="模板名称"
              value={draft.name}
              onChangeText={(name) => update({ name })}
              disabled={action.busy}
              maxLength={80}
            />
            <View className="border-t border-border" />
            <AdminText>审核设置</AdminText>
            <AdminToggle
              label="启用 AI 审核"
              value={draft.aiEnabled}
              onChange={(aiEnabled) => update({ aiEnabled })}
              disabled={action.busy}
            />
            <AdminSelect
              label="AI 审核标准"
              value={draft.aiStandardId}
              onChange={(aiStandardId) => update({ aiStandardId })}
              disabled={action.busy}
              options={resource.data.standards.map((standard) => ({
                value: standard.id,
                label: standard.name,
              }))}
            />
            <Text className={classes.muted} style={styles.muted}>
              {resource.data.standards.length
                ? '启用 AI 时必须选择审核标准；关闭时可不选。'
                : '暂无审核标准，请先创建标准，或取消编辑后使用快捷配置。'}
            </Text>
            <View className="border-t border-border" />
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <AdminText>检查项</AdminText>
              <Text className={classes.muted} style={styles.muted}>
                {draft.items.length} 项
              </Text>
            </View>
            <Text className={classes.muted} style={styles.muted}>
              最少照片数为 0 时不需拍照，巡检提交时必须填写备注。
            </Text>
          </View>
          {draft.items.map((item, index) => (
            <View
              key={item.key}
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                gap: tokens.space.md,
                paddingVertical: tokens.space.md,
              }}
              testID={`template-item-${index + 1}`}
            >
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <Text className={classes.foreground} style={styles.cardTitle}>
                  {`${String(index + 1).padStart(2, '0')} / ${String(draft.items.length).padStart(2, '0')}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
                  <PrimaryButton
                    variant="secondary"
                    disabled={action.busy || index === 0}
                    onPress={() => moveItem(index, -1)}
                  >
                    上移
                  </PrimaryButton>
                  <PrimaryButton
                    variant="secondary"
                    disabled={action.busy || index === draft.items.length - 1}
                    onPress={() => moveItem(index, 1)}
                  >
                    下移
                  </PrimaryButton>
                </View>
              </View>
              <AdminField
                label={`检查项 ${index + 1} 标题`}
                value={item.title}
                onChangeText={(title) => updateItem(index, { title })}
                disabled={action.busy}
              />
              <AdminField
                label={`检查项 ${index + 1} 最少照片张数`}
                value={item.minPhotoCount}
                onChangeText={(minPhotoCount) =>
                  updateItem(index, { minPhotoCount })
                }
                keyboardType="number-pad"
                maxLength={2}
                disabled={action.busy}
              />
              <AdminField
                label={`检查项 ${index + 1} 验收要点`}
                value={item.acceptanceCriteria}
                onChangeText={(acceptanceCriteria) =>
                  updateItem(index, { acceptanceCriteria })
                }
                multiline
                maxLength={500}
                disabled={action.busy}
              />
              <AdminToggle
                label={`检查项 ${index + 1} 严重项`}
                value={item.critical}
                onChange={(critical) => updateItem(index, { critical })}
                disabled={action.busy}
              />
              <PrimaryButton
                variant="secondary"
                disabled={action.busy || draft.items.length === 1}
                onPress={() =>
                  update({
                    items: draft.items.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                移除检查项
              </PrimaryButton>
            </View>
          ))}
          <PrimaryButton
            variant="secondary"
            disabled={action.busy}
            onPress={() => update({ items: [...draft.items, newItem()] })}
          >
            添加检查项
          </PrimaryButton>
        </>
      ) : (
        <>
          <PrimaryButton
            disabled={resource.loading || action.busy}
            onPress={() =>
              setDraft({
                id: null,
                name: '',
                aiEnabled: true,
                aiStandardId: '',
                items: [newItem()],
              })
            }
          >
            新建模板
          </PrimaryButton>
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <AdminText>快捷配置</AdminText>
            <Text className={classes.muted} style={styles.muted}>
              模板与审核标准
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {quickOptions.map(([kind, label]) => (
              <View key={kind} style={{ flex: 1, minWidth: 100 }}>
                <PrimaryButton
                  variant="secondary"
                  disabled={resource.loading || action.busy}
                  onPress={() => quickSetup(kind)}
                >
                  {label}
                </PrimaryButton>
              </View>
            ))}
          </View>
          {!resource.loading && !resource.data.templates.length ? (
            <View
              style={{
                alignItems: 'center',
                borderTopWidth: 1,
                borderTopColor: colors.border,
                gap: tokens.space.sm,
                paddingVertical: tokens.space.xl,
              }}
            >
              <EmptyIllustration variant="template" />
              <Text className={classes.foreground} style={styles.cardTitle}>
                暂无模板
              </Text>
              <Text className={classes.muted} style={styles.muted}>
                使用快捷配置生成模板，或新建模板。
              </Text>
            </View>
          ) : null}
          {resource.data.templates.map((template) => (
            <Pressable
              accessibilityRole="button"
              className="border-b border-border"
              key={template.id}
              onPress={() => edit(template)}
              style={({ pressed }) => [
                {
                  alignItems: 'center',
                  flexDirection: 'row',
                  minHeight: 64,
                  paddingVertical: tokens.space.sm,
                },
                pressed && styles.pressedRow,
              ]}
              testID={`template-${template.id}`}
            >
              <View style={{ flex: 1, gap: tokens.space.xs }}>
                <Text className={classes.foreground} style={styles.cardTitle}>
                  {template.name}
                </Text>
                <Text className={classes.muted} style={styles.muted}>
                  {`${template.items.length} 项 · AI ${template.aiEnabled ? '启用' : '关闭'}`}
                </Text>
              </View>
              <Text className={classes.link} style={styles.link}>
                编辑
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </AdminPage>
  );
}
