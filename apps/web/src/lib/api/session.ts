import type { Session } from './types';
import { getMe } from './auth';

const legacySessionStorageKey = 'floorwalk.session';
let currentSession: Session | null = null;
let sessionCheck: Promise<Session> | null = null;
let sessionChecked = false;

export function hasCheckedSession() {
  return sessionChecked;
}

export function readSession(): Session | null {
  return currentSession;
}

export function writeSession(nextSession: Session) {
  sessionChecked = true;
  // Keep only the current user in memory; the session credential stays in the HttpOnly cookie.
  clearLegacySession();
  currentSession = nextSession;
  sessionCheck = Promise.resolve(nextSession);
}

export function clearSession() {
  sessionChecked = true;
  currentSession = null;
  sessionCheck = null;
  clearLegacySession();
}

export function checkSession(): Promise<Session> {
  if (currentSession) return Promise.resolve(currentSession);
  if (!sessionCheck) {
    sessionCheck = getMe()
      .then((user) => {
        const nextSession = { user };
        writeSession(nextSession);
        return nextSession;
      })
      .catch((reason: unknown) => {
        clearSession();
        throw reason;
      });
  }
  return sessionCheck;
}

export function clearLegacySession() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(legacySessionStorageKey);
    window.sessionStorage.removeItem(legacySessionStorageKey);
  }
}
