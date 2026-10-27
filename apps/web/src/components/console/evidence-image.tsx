import { useEffect, useState } from 'react';
import { getEvidenceUrl, type InspectionDetail } from '@/lib/api';

export function EvidenceImage({
  evidence,
}: {
  evidence: InspectionDetail['items'][number]['evidence'][number];
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    void getEvidenceUrl(evidence.id)
      .then((result) => active && setUrl(result.url))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [evidence.id]);
  return (
    <div className="overflow-hidden rounded-md border bg-muted">
      <img
        src={url || undefined}
        alt="检查项现场照片"
        className="aspect-video w-full object-cover"
      />
    </div>
  );
}
