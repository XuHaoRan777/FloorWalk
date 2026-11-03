import type { CanAccessSite } from '@libs/shared';

export const canAccessSite: CanAccessSite = (user, site, supervisorUserId) => {
  if (user.orgId !== site.orgId) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'supervisor') return supervisorUserId === user.id;
  return user.siteId === site.id;
};
