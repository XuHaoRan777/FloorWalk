import { getSlotEnvironment } from './slot.js';

Object.assign(process.env, getSlotEnvironment());
