import * as ImagePicker from 'expo-image-picker';
import { Camera, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  evidenceMimeTypes,
  maxEvidenceSizeBytes,
  type InspectorTaskDetail,
  type InspectionItemSelfAssessment,
} from '@libs/shared';
import { api, ApiError, userFacingError } from '../../lib/api';
import { ErrorBanner } from './error-banner';
import { MobileButton, MobileStatusTag, MobileText } from './manager-ui';
import { MobilePhotoSlot } from './manager-task-ui';
import { taskItemStyles } from './task-item-card.styles';
import tokens from '../../../../packages/tokens/native.json';

type InspectorTaskItem = InspectorTaskDetail['items'][number];

function resultLabel(result: InspectorTaskItem['result']) {
  if (result === 'pass') return '通过';
  if (result === 'rework') return '打回';
  if (result === 'fail') return '不合格';
  return '待审';
}

function resultStatus(result: InspectorTaskItem['result']) {
  if (result === 'pass') return 'completed' as const;
  if (result === 'rework') return 'rework' as const;
  if (result === 'fail') return 'failed' as const;
  return 'pending' as const;
}

export function TaskItemCard({
  taskId,
  item,
  focused = false,
  onLayout,
  timezone,
  canOperate,
  operationLabel,
  onUnauthorized,
  onUploaded,
}: {
  taskId: string;
  item: InspectorTaskItem;
  focused?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  timezone: string;
  canOperate: boolean;
  operationLabel: string;
  onUnauthorized: () => void;
  onUploaded: () => Promise<void>;
}) {
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [note, setNote] = useState('');
  const [selfAssessment, setSelfAssessment] =
    useState<InspectionItemSelfAssessment | null>(
      item.minPhotoCount === 0 ? 'pass' : null,
    );
  const [capturing, setCapturing] = useState(false);
  const [focusedAssessment, setFocusedAssessment] =
    useState<InspectionItemSelfAssessment | null>(null);
  const [noteFocused, setNoteFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoShortfall = Math.max(0, item.minPhotoCount - photos.length);
  const noteRequired = item.minPhotoCount === 0;
  const canSubmit =
    canOperate &&
    !busy &&
    !capturing &&
    photoShortfall === 0 &&
    (!noteRequired || note.trim().length > 0) &&
    (noteRequired || selfAssessment !== null);

  async function capturePhoto() {
    if (!canOperate || capturing || busy) return;
    setCapturing(true);
    setError(null);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.back,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';
      if (
        !evidenceMimeTypes.includes(
          mimeType as (typeof evidenceMimeTypes)[number],
        )
      ) {
        setError('仅支持 JPEG 或 PNG 图片。');
        return;
      }
      if (
        asset.fileSize !== undefined &&
        asset.fileSize > maxEvidenceSizeBytes
      ) {
        setError('照片不能超过 10MB。');
        return;
      }
      setPhotos((current) => [...current, asset]);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      setError(userFacingError(cause));
    } finally {
      setCapturing(false);
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) =>
      current.filter((_photo, photoIndex) => photoIndex !== index),
    );
  }

  async function submit() {
    if (!canSubmit || !selfAssessment) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadInspectorTaskItem(taskId, item.position, {
        selfAssessment,
        ...(note.trim() ? { note: note.trim() } : {}),
        photos: photos.map((photo, index) => ({
          uri: photo.uri,
          fileName:
            photo.fileName ?? `inspection-${item.position}-${index + 1}.jpg`,
        })),
      });
      setPhotos([]);
      setNote('');
      setSelfAssessment(noteRequired ? 'pass' : null);
      await onUploaded();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      setError(userFacingError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        taskItemStyles.item,
        focused && taskItemStyles.focused,
      ]}
      testID={`task-item-${item.position}`}
    >
      <View style={taskItemStyles.heading}>
        <View style={taskItemStyles.headingCopy}>
          <View style={taskItemStyles.headingTitle}>
            <MobileText role="number" size="sm" tone="muted" style={taskItemStyles.itemNumber}>
              {String(item.position).padStart(2, '0')}
            </MobileText>
            <MobileText size="base" numberOfLines={2}>
              {item.title}
            </MobileText>
          </View>
          {item.acceptanceCriteria.trim().length > 0 ? (
            <View style={taskItemStyles.criteria}>
              <MobileText role="fixed" size="xs" tone="muted">
                验收要点：
              </MobileText>
              <MobileText size="sm" tone="muted">
                {item.acceptanceCriteria}
              </MobileText>
            </View>
          ) : null}
        </View>
        <MobileStatusTag status={resultStatus(item.result)} label={resultLabel(item.result)} />
      </View>

      <View style={taskItemStyles.sectionRow}>
        <MobileText role="fixed" size="sm">
          最少照片：
        </MobileText>
        <MobileText role="number" size="sm" tone="muted">
          {item.minPhotoCount} 张
        </MobileText>
      </View>
      <View style={taskItemStyles.sectionRow}>
        <MobileText size="sm" tone="muted">
          当前结论：{resultLabel(item.result)}
        </MobileText>
        <MobileText role="fixed" size="xs" tone="muted">
          {operationLabel}
        </MobileText>
      </View>
      <View style={taskItemStyles.sectionRow}>
        <MobileText size="sm" tone="muted">
          {item.uploadedByName
            ? `最后提交：${item.uploadedByName}`
            : '尚未提交'}
        </MobileText>
        <MobileText role="number" size="xs" tone="muted">
          {item.uploadedAt
            ? `上传于 ${new Intl.DateTimeFormat('zh-CN', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              }).format(new Date(item.uploadedAt))}`
            : '尚无上传时间'}
        </MobileText>
      </View>

      {item.minPhotoCount > 0 ? (
        <>
          <View style={taskItemStyles.sectionRow}>
            <MobileText role="fixed" size="sm">
              现场照片
            </MobileText>
            <MobileText role="number" size="xs" tone="muted" testID={`photo-count-${item.position}`}>
              {photoShortfall > 0
                ? `还差 ${photoShortfall} 张照片`
                : `已拍 ${photos.length} 张照片`}
            </MobileText>
          </View>
          <View style={taskItemStyles.photoGrid}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={taskItemStyles.photoCell}>
                <MobilePhotoSlot
                  count={`现场照片 ${String(index + 1).padStart(2, '0')}`}
                  label={`${item.position} 项第 ${index + 1} 张现场照片`}
                  source={{ uri: photo.uri }}
                  state="taken"
                />
                <Pressable
                  accessibilityLabel={`移除第${item.position}项第${index + 1}张照片`}
                  accessibilityRole="button"
                  disabled={busy || capturing}
                  onPress={() => removePhoto(index)}
                  style={taskItemStyles.removePhoto}
                >
                  <Trash2 color={tokens.mobile.foreground} size={18} />
                </Pressable>
              </View>
            ))}
            <View style={taskItemStyles.photoCell}>
              {capturing ? (
                <MobilePhotoSlot
                  label="正在打开相机…"
                  state="uploading"
                />
              ) : (
                <MobilePhotoSlot
                  accessibilityLabel={`打开相机拍摄第${item.position}项照片`}
                  icon={<Camera color={tokens.mobile.primary} size={22} />}
                  label={photoShortfall > 0 ? '拍摄照片' : '继续拍照'}
                  disabled={!canOperate || busy}
                  onPress={() => void capturePhoto()}
                  state="empty"
                  testID={`capture-item-${item.position}`}
                />
              )}
            </View>
          </View>
          <View style={taskItemStyles.sectionRow}>
            <MobileText role="fixed" size="sm">
              店长自评
            </MobileText>
            <View style={taskItemStyles.assessmentRow}>
              {(['pass', 'fail'] as const).map((assessment) => {
                const selected = selfAssessment === assessment;
                const label =
                  assessment === 'pass' ? '自评合格' : '自评不合格';
                return (
                  <Pressable
                    key={assessment}
                    accessibilityLabel={`${label}第${item.position}项`}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected,
                      disabled: !canOperate || busy,
                    }}
                    disabled={!canOperate || busy}
                    onPress={() => setSelfAssessment(assessment)}
                    onFocus={() => setFocusedAssessment(assessment)}
                    onBlur={() => setFocusedAssessment(null)}
                    style={[
                      taskItemStyles.assessmentButton,
                      selected &&
                        (assessment === 'pass'
                          ? taskItemStyles.assessmentPassSelected
                          : taskItemStyles.assessmentFailSelected),
                      (!canOperate || busy) &&
                        taskItemStyles.assessmentDisabled,
                      focusedAssessment === assessment &&
                        canOperate &&
                        taskItemStyles.assessmentFocused,
                    ]}
                    testID={`assess-${assessment}-${item.position}`}
                  >
                    <MobileText
                      role="fixed"
                      size="xs"
                      tone={
                        selected
                          ? assessment === 'pass'
                            ? 'success'
                            : 'danger'
                          : 'foreground'
                      }
                    >
                      {label}
                    </MobileText>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {selfAssessment === null ? (
            <MobileText size="sm" tone="muted">
              请选择自评结果。
            </MobileText>
          ) : null}
        </>
      ) : (
        <MobileText size="sm" tone="muted">
          此项不需照片，填写备注后提交。
        </MobileText>
      )}

      <TextInput
        accessibilityLabel={`第${item.position}项备注`}
        editable={canOperate && !busy && !capturing}
        multiline
        onChangeText={setNote}
        onFocus={() => setNoteFocused(true)}
        onBlur={() => setNoteFocused(false)}
        placeholder={noteRequired ? '请填写检查备注' : '添加备注（可选）'}
        placeholderTextColor={tokens.mobile.disabledForeground}
        style={[
          taskItemStyles.noteInput,
          noteFocused && taskItemStyles.focusedInput,
          (!canOperate || busy || capturing) &&
            taskItemStyles.disabledInput,
        ]}
        value={note}
      />
      <ErrorBanner message={error} />
      <MobileButton
        disabled={!canSubmit && !busy}
        loading={busy}
        onPress={() => void submit()}
        testID={`submit-item-${item.position}`}
        style={taskItemStyles.submitButton}
      >
        {busy ? '提交中…' : `提交第 ${item.position} 项`}
      </MobileButton>
    </View>
  );
}
