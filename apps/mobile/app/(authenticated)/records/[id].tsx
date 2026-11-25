import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InspectionDetail } from '@libs/shared';
import { ChatPanel } from '../../../components/mobile/chat-panel';
import { ErrorBanner } from '../../../components/mobile/error-banner';
import { useSession } from '../../../components/mobile/session-provider';
import { MobileEmptyState, MobileSurfaceCard } from '../../../components/mobile/manager-data-ui';
import {
  MobileButton,
  MobileStatusTag,
  MobileText,
  MobileTopBar,
} from '../../../components/mobile/manager-ui';
import { ApiError, api, userFacingError } from '../../../lib/api';
import { evidenceUrl } from '../../../lib/api/records';
import tokens from '../../../../../packages/tokens/native.json';

const statusLabels: Record<InspectionDetail['status'], string> = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  rework: '待补交',
  failed: '未通过',
  passed: '已通过',
};

const statusTags = {
  draft: 'pending',
  submitted: 'submitted',
  in_review: 'in_progress',
  rework: 'rework',
  failed: 'failed',
  passed: 'completed',
} as const;

const resultLabels = {
  pending: '未检查',
  pass: '合格',
  rework: '打回',
  fail: '不合格',
} as const;

const resultTags = {
  pending: 'pending',
  pass: 'completed',
  rework: 'rework',
  fail: 'failed',
} as const;

const reviewLabels = {
  start: '开始审核',
  approve: '审核通过',
  fail: '审核未通过',
  rework: '打回补交',
} as const;

function formatTaskDate(value: string | undefined, createdAt: string) {
  if (value) {
    const [, month, day] = value.split('-');
    return `${month}月${day}日`;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(createdAt));
}

function formatDateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

export default function RecordDetailPage() {
  const { id, templateName, taskDate } = useLocalSearchParams<{
    id: string;
    templateName?: string;
    taskDate?: string;
  }>();
  const router = useRouter();
  const { session, expire } = useSession();
  const [detail, setDetail] = useState<InspectionDetail | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const next = await api.inspection(id);
      setDetail(next);
      const urls = await Promise.all(
        next.items.flatMap((item) =>
          item.evidence.map(async (evidence) => {
            const signed = await evidenceUrl(evidence.id);
            return [evidence.id, signed.url] as const;
          }),
        ),
      );
      setPhotoUrls(Object.fromEntries(urls));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expire();
      setError(userFacingError(cause));
    } finally {
      setLoading(false);
    }
  }, [expire, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <MobileTopBar
        backLabel="返回记录"
        backText="返回记录"
        onBack={() => router.back()}
        subtitle={`巡检记录 · ${detail ? formatTaskDate(taskDate, detail.createdAt) : ''}`}
        title={templateName || '巡检记录'}
        titleRole="body"
        titleSize="lg"
      />
      <ScrollView
        contentContainerStyle={styles.page}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <MobileText size="sm" tone="muted">
            正在加载巡检详情…
          </MobileText>
        ) : null}
        <ErrorBanner message={error} />
        {error ? (
          <MobileButton
            accessibilityHint="重新读取巡检详情和照片"
            onPress={() => void load()}
            variant="secondary"
          >
            重新加载
          </MobileButton>
        ) : null}
        {detail ? (
          <>
            <View style={styles.statusSummary}>
              <MobileText role="fixed" size="sm">
                任务状态
              </MobileText>
              <MobileStatusTag
                status={statusTags[detail.status]}
                label={statusLabels[detail.status]}
              />
              <MobileText role="fixed" size="xs" tone="muted">
                {detail.submittedAt ? '任务已提交' : '尚未提交'}
              </MobileText>
            </View>
            <View style={styles.scoreSummary}>
              <MobileText role="number" size="xl" tone="primary">
                {detail.score ?? '—'}
              </MobileText>
              <MobileText role="fixed" size="sm" tone="muted">
                巡检分数 · {detail.items.length} 个检查项
              </MobileText>
            </View>
            <MobileSurfaceCard
              style={styles.summaryCard}
            >
              <View style={styles.summaryHeading}>
                <MobileText
                  size="lg"
                  numberOfLines={2}
                  style={styles.summarySite}
                >
                  {detail.site.name}
                </MobileText>
                <MobileStatusTag
                  status={statusTags[detail.status]}
                  label={statusLabels[detail.status]}
                />
              </View>
              <MobileText role="body" size="sm" tone="muted">
                {templateName || '巡检记录'} · {formatTaskDate(taskDate, detail.createdAt)}
              </MobileText>
              <View style={styles.summaryDetails} testID="record-detail-summary">
                <MobileText role="fixed" size="sm">
                  状态：{statusLabels[detail.status]}
                </MobileText>
                <MobileText role="fixed" size="sm">
                  分数：{detail.score === null ? '—' : `${detail.score} 分`}
                </MobileText>
                <MobileText role="fixed" size="xs" tone="muted">
                  创建时间：{formatDateTime(detail.createdAt)}
                </MobileText>
                <MobileText role="fixed" size="xs" tone="muted">
                  提交时间：{formatDateTime(detail.submittedAt)}
                </MobileText>
              </View>
            </MobileSurfaceCard>
            <View style={styles.sectionHeading}>
              <MobileText role="fixed" size="lg">
                巡检项目
              </MobileText>
              <MobileText role="number" size="sm" tone="muted">
                {detail.items.length} 项
              </MobileText>
            </View>
            {detail.items.length === 0 ? (
              <MobileEmptyState
                title="当前巡检单没有检查项。"
                style={styles.emptyState}
              />
            ) : (
              detail.items.map((item) => (
                <View key={item.id} testID={`record-item-${item.position}`}>
                  <MobileSurfaceCard style={styles.itemCard}>
                    <View style={styles.itemHeading}>
                      <View style={styles.itemTitleGroup}>
                        <MobileText role="number" size="sm" tone="muted">
                          {String(item.position).padStart(2, '0')}
                        </MobileText>
                        <MobileText
                          size="base"
                          numberOfLines={2}
                          style={styles.itemTitle}
                        >
                          {item.title}
                        </MobileText>
                      </View>
                      <MobileStatusTag
                        status={resultTags[item.result]}
                        label={resultLabels[item.result]}
                      />
                    </View>
                    {item.evidence.map((evidence, index) =>
                      photoUrls[evidence.id] ? (
                        <Image
                          accessibilityLabel={`${item.title}照片 ${index + 1}`}
                          key={evidence.id}
                          resizeMode="cover"
                          source={{ uri: photoUrls[evidence.id] }}
                          style={styles.photo}
                          testID={`record-photo-${evidence.id}`}
                        />
                      ) : (
                        <MobileText key={evidence.id} size="sm" tone="muted">
                          正在加载照片…
                        </MobileText>
                      ),
                    )}
                    {item.acceptanceCriteria.trim() ? (
                      <MobileText size="sm" tone="muted">
                        {item.acceptanceCriteria}
                      </MobileText>
                    ) : null}
                    <MobileText size="sm">
                      备注：{item.note || '—'}
                    </MobileText>
                  </MobileSurfaceCard>
                </View>
              ))
            )}
            <View style={styles.sectionHeading}>
              <MobileText role="fixed" size="lg">
                审核历史
              </MobileText>
            </View>
            {detail.reviews.length ? (
              detail.reviews.map((review) => (
                <MobileSurfaceCard key={review.id} style={styles.reviewCard}>
                  <MobileText role="fixed" size="base">
                    {reviewLabels[review.action]}
                  </MobileText>
                  <MobileText role="number" size="sm" tone="muted">
                    {formatDateTime(review.createdAt)}
                  </MobileText>
                  <MobileText size="sm">
                    意见：{review.comment || '—'}
                  </MobileText>
                </MobileSurfaceCard>
              ))
            ) : (
              <MobileText size="sm" tone="muted">
                暂无审核记录。
              </MobileText>
            )}
          </>
        ) : null}
        <ChatPanel inspectionId={id} canSend />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  screen: { backgroundColor: tokens.mobile.background, flex: 1 },
  page: {
    gap: tokens.mobileSpace.md,
    paddingBottom: tokens.mobileSpace.display,
    paddingHorizontal: tokens.mobileSpace.lg,
    paddingTop: tokens.mobileSpace.md,
  },
  statusSummary: {
    alignItems: 'center',
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    minHeight: 44,
    paddingHorizontal: tokens.mobileSpace.md,
  },
  scoreSummary: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.surface,
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.md,
    minHeight: 44,
    paddingHorizontal: tokens.mobileSpace.md,
  },
  summaryCard: { borderRadius: tokens.mobileRadius.control },
  summaryHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    justifyContent: 'space-between',
  },
  summarySite: { flex: 1, minWidth: 0 },
  summaryDetails: { gap: tokens.mobileSpace.xs },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: tokens.mobileSpace.sm,
  },
  emptyState: {
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 140,
  },
  itemCard: { borderRadius: tokens.mobileRadius.control },
  itemHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    justifyContent: 'space-between',
  },
  itemTitleGroup: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    minWidth: 0,
  },
  itemTitle: { flex: 1, minWidth: 0 },
  photo: {
    aspectRatio: 1.45,
    backgroundColor: tokens.mobile.disabledBackground,
    borderRadius: tokens.mobileRadius.photo,
    width: '100%',
  },
  reviewCard: { borderRadius: tokens.mobileRadius.control },
} satisfies Record<string, import('react-native').ViewStyle>;
