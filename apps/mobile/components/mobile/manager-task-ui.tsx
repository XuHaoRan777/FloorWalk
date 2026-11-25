import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { MobileButton, MobileStatusTag, MobileText } from './manager-ui';
import type { MobileStatus } from './manager-ui';
import tokens from '../../../../packages/tokens/native.json';

export function MobileTaskRow({
  time,
  title,
  description,
  status,
  statusLabel,
  active = false,
  focused = false,
  onPress,
  onFocus,
  onBlur,
  testID,
  accessibilityLabel,
}: {
  time: string;
  title: string;
  description?: string;
  status: MobileStatus;
  statusLabel?: string;
  active?: boolean;
  focused?: boolean;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      testID={testID}
      style={({ pressed }) => [
        styles.taskRow,
        active && styles.activeTaskRow,
        focused && styles.focusedTaskRow,
        pressed && { backgroundColor: tokens.mobile.primarySoft },
      ]}
    >
      <MobileText role="number" size="sm" tone="muted" style={styles.taskTime}>
        {time}
      </MobileText>
      <View style={styles.taskBody}>
        <MobileText size="base" numberOfLines={2}>
          {title}
        </MobileText>
        {description ? (
          <MobileText size="sm" tone="muted" numberOfLines={2}>
            {description}
          </MobileText>
        ) : null}
      </View>
      <MobileStatusTag status={status} label={statusLabel} />
    </Pressable>
  );
}

type MobilePhotoState = 'taken' | 'empty' | 'uploading' | 'failed';

export function MobilePhotoSlot({
  state,
  source,
  label,
  accessibilityLabel,
  count,
  icon,
  disabled = false,
  onPress,
  onRetry,
  style,
  testID,
}: {
  state: MobilePhotoState;
  source?: ImageSourcePropType;
  label?: string;
  accessibilityLabel?: string;
  count?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const content =
    state === 'taken' ? (
      <View style={styles.photoSlot}>
        {source ? (
          <Image
            accessibilityLabel={accessibilityLabel ?? label}
            source={source}
            style={styles.photoImage}
          />
        ) : null}
        <View style={styles.photoCaption}>
          <MobileText role="fixed" size="xs">
            {count ?? label ?? '已拍摄'}
          </MobileText>
        </View>
      </View>
    ) : state === 'empty' ? (
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label ?? '拍摄照片'}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          styles.photoSlot,
          styles.photoEmpty,
          pressed && { backgroundColor: tokens.mobile.primaryTint },
        ]}
      >
        <View style={styles.photoEmptyContent}>
          {icon}
          <MobileText role="fixed" size="sm" tone="primary">
            {label ?? '拍摄照片'}
          </MobileText>
        </View>
      </Pressable>
    ) : state === 'uploading' ? (
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        style={[styles.photoSlot, styles.photoUploading]}
      >
        <ActivityIndicator color={tokens.mobile.primary} size="small" />
        <MobileText role="fixed" size="sm" tone="primary">
          {label ?? '正在上传照片'}
        </MobileText>
      </View>
    ) : (
      <View style={[styles.photoSlot, styles.photoFailed]}>
        <MobileStatusTag status="failed" label={label ?? '上传失败'} />
        {onRetry ? (
          <MobileButton onPress={onRetry} variant="secondary">
            重新上传
          </MobileButton>
        ) : null}
      </View>
    );

  return <View style={style}>{content}</View>;
}

const styles = {
  taskRow: {
    alignItems: 'center',
    borderBottomColor: tokens.mobile.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    minHeight: 68,
    paddingVertical: tokens.mobileSpace.sm,
  },
  activeTaskRow: {
    borderLeftColor: tokens.mobile.primary,
    borderLeftWidth: 3,
    paddingLeft: tokens.mobileSpace.sm,
  },
  focusedTaskRow: {
    borderColor: tokens.mobile.primary,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 2,
  },
  taskTime: { width: 48 },
  taskBody: { flex: 1, gap: tokens.mobileSpace.xs, minWidth: 0 },
  photoSlot: {
    alignItems: 'center',
    aspectRatio: 1.45,
    backgroundColor: tokens.mobile.surface,
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.photo,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  photoImage: { height: '100%', width: '100%' },
  photoCaption: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.surface,
    borderRadius: tokens.mobileRadius.control,
    bottom: tokens.mobileSpace.sm,
    flexDirection: 'row',
    left: tokens.mobileSpace.sm,
    minHeight: 32,
    paddingHorizontal: tokens.mobileSpace.sm,
    position: 'absolute',
    right: tokens.mobileSpace.sm,
  },
  photoEmpty: {
    backgroundColor: tokens.mobile.primarySoft,
    borderColor: tokens.mobile.primary,
    borderStyle: 'dashed',
  },
  photoEmptyContent: {
    alignItems: 'center',
    gap: tokens.mobileSpace.sm,
  },
  photoUploading: {
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
  },
  photoFailed: { gap: tokens.mobileSpace.sm },
} satisfies Record<string, ViewStyle>;
