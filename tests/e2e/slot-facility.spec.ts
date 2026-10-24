import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';
import {
  getSlotDatabaseUrl,
  getSlotMarkerPath,
  resetSlotResources,
  slot,
  storageDir,
} from './slot.js';

test('slot resources are isolated', async () => {
  await resetSlotResources();
  const pool = createPool(getSlotDatabaseUrl());
  try {
    const evidence = await pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM floorwalk.evidence ORDER BY storage_key',
    );
    expect(evidence.rows.length).toBeGreaterThan(0);
    for (const file of evidence.rows)
      await access(path.resolve(storageDir, file.storage_key));
  } finally {
    await pool.end();
  }
  const markerPath = getSlotMarkerPath();
  await writeFile(markerPath, `slot-${slot}`, 'utf8');
  await access(markerPath);
  expect(storageDir).toContain(`slot-${slot}`);
  expect(slot).toBeGreaterThanOrEqual(1);
  expect(slot).toBeLessThanOrEqual(3);
});
