import type { CanAccessSite } from '@libs/shared';

export const canAccessSite: CanAccessSite = (user, site) => {
  if (user.orgId !== site.orgId) return false;
  if (user.role === 'admin') return true;
  return user.siteId === site.id;
};
