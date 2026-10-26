import type { Session } from './types';
import { sessionStorageKey } from './request';

export function readSession(): Session | null {
  const raw = localStorage.getItem(sessionStorageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem(sessionStorageKey);
    return null;
  }
}

export function writeSession(session: Session) {
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(sessionStorageKey);
}
