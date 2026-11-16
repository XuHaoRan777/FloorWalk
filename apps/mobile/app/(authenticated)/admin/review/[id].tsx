import { useLocalSearchParams } from 'expo-router';
import { ReviewDetailScreen } from '../../../../components/mobile/admin/review-detail-screen';

export default function ReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReviewDetailScreen key={id} id={id} />;
}
