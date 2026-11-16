import { useCallback, useState } from 'react';
import { Image, Text } from 'react-native';
import type { SignedEvidenceResponse } from '@libs/shared';
import { evidenceUrl } from '../../../lib/api/records';
import { PrimaryButton } from '../primary-button';
import { classes, styles } from '../styles';
import { AdminText } from './admin-ui';
import { useAdminResource } from './use-admin-data';

export function ReviewEvidence({ id }: { id: string }) {
  const fetcher = useCallback(() => evidenceUrl(id), [id]);
  const resource = useAdminResource(
    fetcher,
    null as SignedEvidenceResponse | null,
  );
  const [imageFailed, setImageFailed] = useState(false);
  if (resource.error || imageFailed)
    return (
      <>
        <Text className={classes.muted} style={styles.muted}>
          {resource.error ?? '照片加载失败。'}
        </Text>
        <PrimaryButton
          disabled={resource.loading}
          variant="secondary"
          onPress={() => {
            setImageFailed(false);
            void resource.load();
          }}
        >
          重试照片
        </PrimaryButton>
      </>
    );
  return resource.data && !resource.loading ? (
    <Image
      accessibilityLabel="检查项现场照片"
      source={{ uri: resource.data.url }}
      resizeMode="contain"
      onError={() => setImageFailed(true)}
      style={{ width: '100%', height: 210, borderRadius: 8 }}
    />
  ) : (
    <AdminText>照片加载中…</AdminText>
  );
}
