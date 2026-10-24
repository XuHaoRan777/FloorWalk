import { resetSlotResources } from './slot.js';

export default async function globalSetup() {
  await resetSlotResources();
}
