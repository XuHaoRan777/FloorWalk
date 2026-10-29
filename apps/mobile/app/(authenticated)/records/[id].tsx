import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { InspectionDetail } from '@libs/shared';
import { ChatPanel } from '../../../components/mobile/chat-panel';
import { ErrorBanner } from '../../../components/mobile/error-banner';
import { useSession } from '../../../components/mobile/session-provider';
import { styles } from '../../../components/mobile/styles';
import { ApiError, api, userFacingError } from '../../../lib/api';

const statusLabels: Record<InspectionDetail['status'], string> = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  rework: '待补交',
  failed: '未通过',
  passed: '已通过',
};

const resultLabels = {
  pending: '未检查',
  pass: '合格',
  fail: '不合格',
} as const;

const reviewLabels = {
  start: '开始审核',
  approve: '审核通过',
  fail: '审核未通过',
  rework: '打回补交',
} as const;

export default function RecordDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
            const signed = await api.evidenceUrl(evidence.id);
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
    <ScrollView contentContainerStyle={styles.page}>
      <Text accessibilityRole="header" style={styles.heading}>
        巡检记录详情
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.link}
      >
        返回记录
      </Pressable>
      {loading && <Text style={styles.muted}>正在加载巡检详情…</Text>}
      <ErrorBanner message={error} />
      {error && (
        <Text
          accessibilityRole="button"
          onPress={() => void load()}
          style={styles.link}
        >
          重新加载
        </Text>
      )}
      {detail && (
        <>
          <View style={styles.card} testID="record-detail-summary">
            <Text style={styles.cardTitle}>{detail.site.name}</Text>
            <Text style={styles.value}>
              状态：{statusLabels[detail.status]}
            </Text>
            <Text style={styles.value}>
              分数：{detail.score === null ? '—' : `${detail.score} 分`}
            </Text>
            <Text style={styles.muted}>
              创建时间：{new Date(detail.createdAt).toLocaleString('zh-CN')}
            </Text>
            <Text style={styles.muted}>
              提交时间：
              {detail.submittedAt
                ? new Date(detail.submittedAt).toLocaleString('zh-CN')
                : '—'}
            </Text>
          </View>
          <Text style={styles.sectionTitle}>检查项</Text>
          {detail.items.map((item) => (
            <View
              key={item.id}
              style={styles.card}
              testID={`record-item-${item.position}`}
            >
              <Text style={styles.cardTitle}>
                {item.position}. {item.title}
              </Text>
              <Text style={styles.value}>
                结果：{resultLabels[item.result]}
              </Text>
              <Text style={styles.muted}>备注：{item.note || '—'}</Text>
              {item.evidence.map((evidence) =>
                photoUrls[evidence.id] ? (
                  <Image
                    accessibilityLabel={`${item.title}照片`}
                    key={evidence.id}
                    resizeMode="contain"
                    source={{ uri: photoUrls[evidence.id] }}
                    style={styles.chatImage}
                    testID={`record-photo-${evidence.id}`}
                  />
                ) : (
                  <Text key={evidence.id} style={styles.muted}>
                    正在加载照片…
                  </Text>
                ),
              )}
            </View>
          ))}
          <Text style={styles.sectionTitle}>审核历史</Text>
          {detail.reviews.length ? (
            detail.reviews.map((review) => (
              <View
                key={review.id}
                style={styles.card}
                testID={`review-${review.id}`}
              >
                <Text style={styles.cardTitle}>
                  {reviewLabels[review.action]}
                </Text>
                <Text style={styles.muted}>
                  {new Date(review.createdAt).toLocaleString('zh-CN')}
                </Text>
                <Text style={styles.value}>意见：{review.comment || '—'}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>暂无审核记录。</Text>
          )}
        </>
      )}
      <ChatPanel inspectionId={id} canSend />
    </ScrollView>
  );
}
