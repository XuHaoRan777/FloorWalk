import { describe, expect, it } from 'vitest';
import type { CanAccessSite } from '@libs/shared';
import { canAccessSite } from '../services/site-scope.js';

const user: Parameters<CanAccessSite>[0] = {
  id: 'user',
  orgId: 'org',
  role: 'admin',
  siteId: null,
};
const site = { id: 'site', orgId: 'org', active: false };

describe('site scope', () => {
  it('allows admins only sites in their organization', () => {
    expect(canAccessSite(user, site)).toBe(true);
    expect(canAccessSite(user, { ...site, id: 'other' })).toBe(true);
    expect(canAccessSite(user, { ...site, orgId: 'other' })).toBe(false);
  });

  it('allows store managers only their own site', () => {
    const manager = { ...user, role: 'store_manager' as const, siteId: 'site' };
    expect(canAccessSite(manager, site)).toBe(true);
    expect(canAccessSite(manager, { ...site, id: 'other' })).toBe(false);
    expect(canAccessSite(manager, { ...site, orgId: 'other' })).toBe(false);
    expect(canAccessSite({ ...manager, siteId: null }, site)).toBe(false);
  });
});
