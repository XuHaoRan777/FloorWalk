import { StyleSheet } from 'react-native';
import tokens from '../../../../packages/tokens/native.json';

export const taskItemStyles = StyleSheet.create({
  item: {
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
    gap: tokens.mobileSpace.md,
    paddingVertical: tokens.mobileSpace.md,
  },
  focused: {
    borderColor: tokens.mobile.primary,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 2,
    paddingHorizontal: tokens.mobileSpace.sm,
  },
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.mobileSpace.sm,
    justifyContent: 'space-between',
  },
  headingCopy: { flex: 1, gap: tokens.mobileSpace.xs, minWidth: 0 },
  headingTitle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.mobileSpace.xs,
  },
  itemNumber: { minWidth: 24 },
  criteria: {
    gap: tokens.mobileSpace.xs,
    paddingLeft: tokens.mobileSpace.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.mobileSpace.sm,
  },
  photoCell: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    position: 'relative',
  },
  removePhoto: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.surface,
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: tokens.mobileSpace.xs,
    top: tokens.mobileSpace.xs,
    width: 40,
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  assessmentRow: { flexDirection: 'row', gap: tokens.mobileSpace.sm },
  assessmentButton: {
    alignItems: 'center',
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: tokens.mobileSpace.sm,
  },
  assessmentPassSelected: {
    backgroundColor: tokens.mobile.successTint,
    borderColor: tokens.mobile.success,
  },
  assessmentFailSelected: {
    backgroundColor: tokens.mobile.dangerTint,
    borderColor: tokens.mobile.danger,
  },
  assessmentDisabled: {
    backgroundColor: tokens.mobile.disabledBackground,
    borderColor: tokens.mobile.border,
  },
  assessmentFocused: {
    borderColor: tokens.mobile.primary,
    borderWidth: 2,
    boxShadow: tokens.mobileShadow.focus,
  },
  noteInput: {
    backgroundColor: tokens.mobile.surface,
    borderColor: tokens.mobile.input,
    borderRadius: tokens.mobileRadius.control,
    borderWidth: 1,
    color: tokens.mobile.foreground,
    fontSize: tokens.mobileType.base,
    minHeight: 80,
    paddingHorizontal: tokens.mobileSpace.sm,
    paddingVertical: tokens.mobileSpace.sm,
    textAlignVertical: 'top',
  },
  focusedInput: {
    borderColor: tokens.mobile.primary,
    borderWidth: 2,
    boxShadow: tokens.mobileShadow.focus,
  },
  disabledInput: {
    backgroundColor: tokens.mobile.disabledBackground,
    borderColor: tokens.mobile.border,
    color: tokens.mobile.disabledForeground,
  },
  submitButton: { width: '100%' },
  chat: { marginTop: tokens.mobileSpace.md },
});
