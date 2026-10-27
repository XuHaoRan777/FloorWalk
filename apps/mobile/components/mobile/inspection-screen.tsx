import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { InspectionDetail } from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { PrimaryButton } from './primary-button';
import { styles } from './styles';

export function InspectionScreen({
  id,
  onBack,
  onUnauthorized,
}: {
  id: string;
  onBack: () => void;
  onUnauthorized: () => void;
}) {
  const [detail, setDetail] = useState<InspectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItems, setBusyItems] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<{
    score: number | null;
    status: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const nextDetail = await api.inspection(id);
      setDetail(nextDetail);
      return nextDetail;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      setError(userFacingError(cause));
      return null;
    }
  }, [id, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestRework = useMemo(() => {
    if (!detail) return null;
    return (
      [...detail.reviews]
        .reverse()
        .find((review) => review.action === 'rework') ?? null
    );
  }, [detail]);

  async function updateItem(itemId: string, result: 'pass' | 'fail') {
    if (!detail) return;
    setError(null);
    setBusyItems((current) => ({ ...current, [itemId]: true }));
    try {
      const updatedItem = await api.updateItem(
        detail.id,
        itemId,
        result,
        notes[itemId] ??
          detail.items.find((item) => item.id === itemId)?.note ??
          null,
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updatedItem.id ? updatedItem : item,
              ),
            }
          : current,
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setBusyItems((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }
  }

  async function addPhoto(itemId: string) {
    if (!detail) return;
    setError(null);
    setBusyItems((current) => ({ ...current, [itemId]: true }));
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const evidence = await api.uploadEvidence(
        detail.id,
        itemId,
        asset.uri,
        asset.fileName ?? `inspection-${itemId}.jpg`,
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === itemId
                  ? { ...item, evidence: [...item.evidence, evidence] }
                  : item,
              ),
            }
          : current,
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setBusyItems((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }
  }

  async function submit() {
    if (!detail || submitting || Object.keys(busyItems).length > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const latestDetail = await load();
      if (!latestDetail) return;
      const missing = latestDetail.items.filter(
        (item) =>
          item.result === 'pending' ||
          (item.photoRequired && item.evidence.length === 0),
      );
      if (missing.length > 0) {
        setError(`请完成：${missing.map((item) => item.title).join('、')}`);
        return;
      }
      for (const item of latestDetail.items) {
        if (item.result !== 'pending' && notes[item.id] !== undefined) {
          await api.updateItem(
            latestDetail.id,
            item.id,
            item.result,
            notes[item.id] ?? item.note ?? null,
          );
        }
      }
      const response = await api.submit(latestDetail.id);
      setSubmitted(response);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(userFacingError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (!detail)
    return (
      <View style={styles.centered}>
        <Text style={styles.description}>正在加载巡检单…</Text>
        <ErrorBanner message={error} />
      </View>
    );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityLabel="返回今日待巡" onPress={onBack}>
        <Text style={styles.link}>‹ 返回今日待巡</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.heading}>
        巡检详情
      </Text>
      {latestRework && (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>主管打回</Text>
          <Text>
            {latestRework.comment || '请修改被标记的检查项后重新提交。'}
          </Text>
        </View>
      )}
      {detail.items.map((item) => {
        const highlighted =
          latestRework?.reworkItemIds?.includes(item.id) ?? false;
        return (
          <View
            key={item.id}
            style={[styles.card, highlighted && styles.highlightedCard]}
            testID={`inspection-item-${item.position}`}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.cardTitle}>
                {item.position}. {item.title}
              </Text>
              {item.photoRequired && <Text style={styles.required}>必拍</Text>}
            </View>
            {highlighted && (
              <Text style={styles.highlightText}>需要补充或修改</Text>
            )}
            <View style={styles.actionRow}>
              <PrimaryButton
                disabled={busyItems[item.id] === true}
                onPress={() => void updateItem(item.id, 'pass')}
              >
                合格
              </PrimaryButton>
              <PrimaryButton
                disabled={busyItems[item.id] === true}
                onPress={() => void updateItem(item.id, 'fail')}
                variant="danger"
              >
                不合格
              </PrimaryButton>
            </View>
            <Text style={styles.muted}>
              当前结果：
              {item.result === 'pending'
                ? '未填写'
                : item.result === 'pass'
                  ? '合格'
                  : '不合格'}
            </Text>
            <TextInput
              accessibilityLabel={`${item.title}备注`}
              onChangeText={(value) =>
                setNotes((current) => ({ ...current, [item.id]: value }))
              }
              placeholder="填写现场备注（可选）"
              style={styles.noteInput}
              value={notes[item.id] ?? item.note ?? ''}
            />
            {item.photoRequired && (
              <PrimaryButton
                disabled={busyItems[item.id] === true}
                onPress={() => void addPhoto(item.id)}
                variant="secondary"
              >
                {item.evidence.length
                  ? `已上传 ${item.evidence.length} 张照片`
                  : '选择照片'}
              </PrimaryButton>
            )}
          </View>
        );
      })}
      <ErrorBanner message={error} />
      {submitted && (
        <View style={styles.success}>
          <Text>
            已提交：{submitted.status}，分数 {submitted.score ?? '待审核'}
          </Text>
        </View>
      )}
      <PrimaryButton
        disabled={
          submitting ||
          Object.keys(busyItems).length > 0 ||
          detail.status === 'submitted'
        }
        onPress={() => void submit()}
        testID="submit-inspection"
      >
        {submitting
          ? '提交中…'
          : Object.keys(busyItems).length > 0
            ? '处理中…'
            : '提交巡检'}
      </PrimaryButton>
    </ScrollView>
  );
}
