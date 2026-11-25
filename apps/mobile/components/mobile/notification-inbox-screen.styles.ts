import { StyleSheet } from 'react-native';
import tokens from '../../../../packages/tokens/native.json';

export const notificationInboxStyles = StyleSheet.create({
  screen: {
    backgroundColor: tokens.mobile.background,
    flex: 1,
    paddingHorizontal: tokens.mobileSpace.lg,
  },
  header: {
    borderBottomWidth: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingTop: tokens.mobileSpace.lg,
    paddingBottom: tokens.mobileSpace.md,
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    gap: tokens.mobileSpace.sm,
    justifyContent: 'center',
  },
  retryState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: tokens.mobileSpace.display,
    paddingTop: tokens.mobileSpace.lg,
  },
  emptyState: {
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 148,
  },
  notificationList: {
    gap: 0,
    paddingBottom: tokens.mobileSpace.display,
  },
  sectionHeading: {
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
    paddingBottom: tokens.mobileSpace.sm,
    paddingTop: tokens.mobileSpace.md,
  },
  notificationRow: {
    alignItems: 'flex-start',
    borderBottomColor: tokens.mobile.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: tokens.mobileSpace.md,
    minHeight: 76,
    paddingVertical: tokens.mobileSpace.md,
  },
  unreadDot: {
    backgroundColor: tokens.mobile.primary,
    borderRadius: tokens.mobileRadius.pill,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  readDot: {
    backgroundColor: tokens.mobile.disabledForeground,
    borderRadius: tokens.mobileRadius.pill,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  notificationCopy: {
    flex: 1,
    gap: tokens.mobileSpace.xs,
    minWidth: 0,
  },
  pressedRow: { backgroundColor: tokens.mobile.primarySoft },
  loadingMore: { paddingVertical: tokens.mobileSpace.md },
});
