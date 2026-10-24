import { access, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {
  getSlotMarkerPath,
  resetSlotResources,
  slot,
  storageDir,
} from './slot.js';

test('slot resources are isolated', async () => {
  await resetSlotResources();
  const markerPath = getSlotMarkerPath();
  await writeFile(markerPath, `slot-${slot}`, 'utf8');
  await access(markerPath);
  expect(storageDir).toContain(`slot-${slot}`);
  expect(slot).toBeGreaterThanOrEqual(1);
  expect(slot).toBeLessThanOrEqual(3);
});
