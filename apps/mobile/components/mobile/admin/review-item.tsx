import { useState } from 'react';
import type { TaskItemDecisionRequest, TaskReviewItem } from '@libs/shared';
import { PrimaryButton } from '../primary-button';
import { AdminCard, AdminField, AdminText } from './admin-ui';
import { ReviewEvidence } from './review-evidence';
import { reviewTime } from './review-format';

const labels = {
  pending: '待判定',
  pass: '通过',
  rework: '打回',
  fail: '不合格',
};

export function ReviewItem({
  item,
  locked,
  reworkAllowed,
  busy,
  decide,
}: {
  item: TaskReviewItem;
  locked: boolean;
  reworkAllowed: boolean;
  busy: boolean;
  decide: (id: string, decision: TaskItemDecisionRequest) => Promise<boolean>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const canDecide = !busy && (locked || item.uploadedAt !== null);
  return (
    <AdminCard testID={`review-item-${item.position}`}>
      <AdminText>{`${item.position}. ${item.title}${item.critical ? ' · 严重项' : ''}`}</AdminText>
      <AdminText>{`判定：${labels[item.result]}${item.incomplete ? ' · 未完成' : ''}`}</AdminText>
      <AdminText>{`${item.uploadedByName ?? '系统'} · 上传于 ${reviewTime(item.uploadedAt)}`}</AdminText>
      <AdminText>
        {item.minPhotoCount > 0
          ? `至少 ${item.minPhotoCount} 张照片`
          : '可不上传照片，需填写备注'}
      </AdminText>
      {item.selfAssessment ? (
        <AdminText>{`自评：${item.selfAssessment === 'pass' ? '通过' : '不通过'}`}</AdminText>
      ) : null}
      {item.acceptanceCriteria ? (
        <AdminText>{`验收要点：${item.acceptanceCriteria}`}</AdminText>
      ) : null}
      {item.aiReason ? (
        <AdminText>{`AI 理由：${item.aiReason}`}</AdminText>
      ) : null}
      {item.lastReworkReason ? (
        <AdminText>{`打回理由：${item.lastReworkReason}`}</AdminText>
      ) : null}
      {item.note ? <AdminText>{`备注：${item.note}`}</AdminText> : null}
      {item.evidence.map((evidence) => (
        <ReviewEvidence key={evidence.id} id={evidence.id} />
      ))}
      <PrimaryButton
        disabled={!canDecide || item.result === 'pass'}
        onPress={() => void decide(item.id, { result: 'pass' })}
      >
        通过
      </PrimaryButton>
      <PrimaryButton
        disabled={!canDecide || !reworkAllowed || item.result === 'rework'}
        variant="secondary"
        onPress={() => setReason(item.lastReworkReason ?? '')}
      >
        打回
      </PrimaryButton>
      <PrimaryButton
        disabled={!canDecide || item.result === 'fail'}
        variant="danger"
        onPress={() => void decide(item.id, { result: 'fail' })}
      >
        不合格
      </PrimaryButton>
      {!reworkAllowed ? (
        <AdminText>已过打回时间，仅可判通过或不合格。</AdminText>
      ) : null}
      {reason !== null ? (
        <>
          <AdminField
            label="打回理由"
            value={reason}
            onChangeText={setReason}
            disabled={busy}
            multiline
          />
          <PrimaryButton
            disabled={!canDecide || !reworkAllowed || !reason.trim()}
            onPress={() => {
              void decide(item.id, {
                result: 'rework',
                reason: reason.trim(),
              }).then((saved) => saved && setReason(null));
            }}
          >
            确认打回
          </PrimaryButton>
          <PrimaryButton
            disabled={busy}
            variant="secondary"
            onPress={() => setReason(null)}
          >
            取消
          </PrimaryButton>
        </>
      ) : null}
    </AdminCard>
  );
}
