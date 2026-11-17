import * as ImagePicker from 'expo-image-picker';
import { Camera, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  Image,
  Pressable,
  Text,
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
import { PrimaryButton } from './primary-button';
import { classes, styles } from './styles';

type InspectorTaskItem = InspectorTaskDetail['items'][number];

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
      className={
        focused ? `${classes.card} ${classes.highlightedCard}` : classes.card
      }
      onLayout={onLayout}
      style={[styles.card, focused && styles.highlightedCard]}
      testID={`task-item-${item.position}`}
    >
      <Text className={classes.foreground} style={styles.cardTitle}>
        {item.position}. {item.title}
      </Text>
      {item.acceptanceCriteria && (
        <Text className={classes.muted} style={styles.muted}>
          验收要点：{item.acceptanceCriteria}
        </Text>
      )}
      <Text className={classes.muted} style={styles.muted}>
        最少照片：{item.minPhotoCount} 张
      </Text>
      <Text className={classes.muted} style={styles.muted}>
        当前结论：
        {item.result === 'pending'
          ? '待审'
          : item.result === 'pass'
            ? '通过'
            : item.result === 'rework'
              ? '打回'
              : '不合格'}
      </Text>
      <Text className={classes.muted} style={styles.muted}>
        {item.uploadedByName ? `最后提交：${item.uploadedByName}` : '尚未提交'}
      </Text>
      <Text className={classes.muted} style={styles.muted}>
        {item.uploadedAt
          ? `上传于 ${new Intl.DateTimeFormat('zh-CN', {
              timeZone: timezone,
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }).format(new Date(item.uploadedAt))}`
          : '尚无上传时间'}
      </Text>
      <Text className={classes.muted} style={styles.muted}>
        {operationLabel}
      </Text>
      {item.minPhotoCount > 0 && (
        <>
          <Text className={classes.muted} style={styles.muted}>
            自评结果
          </Text>
          <View style={styles.actionRow}>
            {(['pass', 'fail'] as const).map((assessment) => {
              const selected = selfAssessment === assessment;
              const label = assessment === 'pass' ? '自评合格' : '自评不合格';
              return (
                <Pressable
                  key={assessment}
                  accessibilityLabel={`${label}第${item.position}项`}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected,
                    disabled: !canOperate || busy,
                  }}
                  className={
                    selected
                      ? assessment === 'pass'
                        ? classes.success
                        : classes.dangerButton
                      : classes.secondaryButton
                  }
                  disabled={!canOperate || busy}
                  onPress={() => setSelfAssessment(assessment)}
                  style={[
                    styles.touchTarget,
                    styles.assessmentOption,
                    !canOperate && styles.disabledButton,
                  ]}
                  testID={`assess-${assessment}-${item.position}`}
                >
                  <Text
                    className={
                      selected
                        ? classes.primaryButtonText
                        : classes.secondaryButtonText
                    }
                    style={styles.buttonText}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      {item.minPhotoCount > 0 && (
        <>
          <Text
            className={classes.muted}
            style={styles.muted}
            testID={`photo-count-${item.position}`}
          >
            {photoShortfall > 0
              ? `还差 ${photoShortfall} 张照片`
              : `已拍 ${photos.length} 张照片`}
          </Text>
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} style={styles.photoPreview}>
                  <Image
                    accessibilityLabel={`${item.position} 项第 ${index + 1} 张照片`}
                    resizeMode="cover"
                    source={{ uri: photo.uri }}
                    style={styles.photoImage}
                  />
                  <Pressable
                    accessibilityLabel={`移除第${item.position}项第${index + 1}张照片`}
                    accessibilityRole="button"
                    disabled={busy || capturing}
                    onPress={() => removePhoto(index)}
                    style={styles.removePhoto}
                  >
                    <Trash2 size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Pressable
            accessibilityLabel={`打开相机拍摄第${item.position}项照片`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canOperate || busy || capturing }}
            className={`${classes.secondaryButton} ${classes.actionButton}`}
            disabled={!canOperate || busy || capturing}
            onPress={() => void capturePhoto()}
            style={[
              styles.actionButton,
              (!canOperate || busy || capturing) && styles.disabledButton,
            ]}
            testID={`capture-item-${item.position}`}
          >
            <Camera size={18} />
            <Text
              className={classes.secondaryButtonText}
              style={styles.buttonText}
            >
              {capturing ? '正在打开相机…' : '拍摄照片'}
            </Text>
          </Pressable>
          {selfAssessment === null && (
            <Text className={classes.muted} style={styles.muted}>
              请选择自评结果。
            </Text>
          )}
        </>
      )}
      <TextInput
        accessibilityLabel={`第${item.position}项备注`}
        editable={canOperate && !busy && !capturing}
        multiline
        onChangeText={setNote}
        className={classes.noteInput}
        placeholder={noteRequired ? '请填写检查备注' : '添加备注（可选）'}
        style={styles.noteInput}
        value={note}
      />
      {noteRequired && (
        <Text className={classes.muted} style={styles.muted}>
          此项不需照片，填写备注后提交。
        </Text>
      )}
      <ErrorBanner message={error} />
      <PrimaryButton
        disabled={!canSubmit}
        onPress={() => void submit()}
        testID={`submit-item-${item.position}`}
      >
        {busy ? '提交中…' : `提交第 ${item.position} 项`}
      </PrimaryButton>
    </View>
  );
}
