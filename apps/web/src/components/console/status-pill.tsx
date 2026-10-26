import type { InspectionDetail } from '@/lib/api';
import { statusLabel } from './labels';

export function StatusPill({ status }: { status: InspectionDetail['status'] }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
      {statusLabel[status]}
    </span>
  );
}
