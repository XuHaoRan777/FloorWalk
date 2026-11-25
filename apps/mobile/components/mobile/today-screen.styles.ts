import { StyleSheet } from 'react-native';
import tokens from '../../../../packages/tokens/native.json';

export const todayStyles = StyleSheet.create({
  screen: {
    backgroundColor: tokens.mobile.background,
    flex: 1,
  },
  page: {
    gap: tokens.mobileSpace.lg,
    paddingBottom: tokens.mobileSpace.display,
    paddingHorizontal: tokens.mobileSpace.lg,
    paddingTop: tokens.mobileSpace.lg,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.mobileSpace.xs,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: tokens.mobileRadius.control,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  focusedHeaderButton: {
    borderColor: tokens.mobile.primary,
    borderWidth: 2,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: tokens.mobile.danger,
    borderColor: tokens.mobile.surface,
    borderRadius: tokens.mobileRadius.pill,
    borderWidth: 2,
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: tokens.mobileSpace.xs,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  listHeader: {
    gap: tokens.mobileSpace.lg,
  },
  pageHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pageHeadingText: {
    flex: 1,
    gap: tokens.mobileSpace.xs,
    minWidth: 0,
  },
  progress: {
    gap: tokens.mobileSpace.sm,
  },
  progressHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressTrack: {
    flexDirection: 'row',
    gap: tokens.mobileSpace.xs,
  },
  progressSegment: {
    borderRadius: tokens.mobileRadius.pill,
    flex: 1,
    height: 8,
    minWidth: 6,
  },
  progressSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.mobileSpace.xs,
  },
  resumeCard: {
    borderRadius: tokens.mobileRadius.large,
  },
  resumeHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resumeCopy: {
    gap: tokens.mobileSpace.xs,
  },
  resumeButton: {
    minHeight: 48,
    width: '100%',
  },
  taskHeading: {
    alignItems: 'baseline',
    borderTopColor: tokens.mobile.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: tokens.mobileSpace.md,
  },
  emptyState: {
    alignSelf: 'stretch',
    borderColor: tokens.mobile.border,
    borderRadius: tokens.mobileRadius.control,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 180,
  },
  loading: {
    alignItems: 'center',
    flexGrow: 1,
    gap: tokens.mobileSpace.md,
    justifyContent: 'center',
    padding: tokens.mobileSpace.lg,
  },
});
