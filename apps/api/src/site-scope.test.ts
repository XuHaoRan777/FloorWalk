import { describe, expect, it } from 'vitest';
import type { CanAccessSite } from '@libs/shared';
import { canAccessSite } from './site-scope.js';

const user: Parameters<CanAccessSite>[0] = {
  id: 'user',
  orgId: 'org',
  role: 'admin',
  siteId: 'site',
};
const site = { id: 'site', orgId: 'org', active: false };

describe('site scope (including inactive sites for history)', () => {
  it('allows admins all sites in their organization only', () => {
    expect(canAccessSite(user, site, null)).toBe(true);
    expect(canAccessSite(user, { ...site, id: 'other' }, null)).toBe(true);
    expect(canAccessSite(user, { ...site, orgId: 'other' }, null)).toBe(false);
  });

  it('allows supervisors only sites assigned to them', () => {
    const supervisor = { ...user, role: 'supervisor' as const, siteId: null };
    expect(canAccessSite(supervisor, site, user.id)).toBe(true);
    expect(canAccessSite(supervisor, site, 'other')).toBe(false);
    expect(canAccessSite(supervisor, site, null)).toBe(false);
    expect(
      canAccessSite(supervisor, { ...site, orgId: 'other' }, user.id),
    ).toBe(false);
  });

  it('allows inspectors their own site only', () => {
    const inspector = { ...user, role: 'inspector' as const };
    expect(canAccessSite(inspector, site, null)).toBe(true);
    expect(canAccessSite(inspector, { ...site, id: 'other' }, null)).toBe(
      false,
    );
    expect(canAccessSite(inspector, { ...site, orgId: 'other' }, null)).toBe(
      false,
    );
    expect(canAccessSite({ ...inspector, siteId: null }, site, null)).toBe(
      false,
    );
  });
});
