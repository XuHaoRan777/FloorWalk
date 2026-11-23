import { useLocalSearchParams } from 'expo-router';
import { ReviewDetailScreen } from '../../../../components/mobile/admin/review-detail-screen';

export default function ReviewRoute() {
  const { id, returnTo } = useLocalSearchParams<{
    id: string;
    returnTo?: string;
  }>();
  return (
    <ReviewDetailScreen
      key={id}
      id={id}
      returnTo={
        returnTo === 'today' || returnTo === 'notifications'
          ? returnTo
          : 'review'
      }
    />
  );
}
