import { z } from 'zod';

export const uuid = z.string().uuid();
export const timestamp = z.string().datetime({ offset: true });

export const userRoles = ['admin', 'store_manager'] as const;
export const userRoleSchema = z.enum(userRoles);
export const loginNameSchema = z.union([
  z.string().email(),
  z.string().regex(/^1[3-9]\d{9}$/),
]);

export const organizationSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  timezone: z.string().min(1),
  createdAt: timestamp,
});

export const organizationSummarySchema = organizationSchema.pick({
  id: true,
  name: true,
});

export const siteSchema = z.object({
  id: uuid,
  code: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  createdAt: timestamp,
});

export const userSchema = z.object({
  id: uuid,
  loginName: loginNameSchema,
  displayName: z.string().min(1),
  role: userRoleSchema,
  siteId: uuid.nullable(),
  org: organizationSummarySchema,
  mustChangePassword: z.boolean(),
  createdAt: timestamp,
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Site = z.infer<typeof siteSchema>;
export type User = z.infer<typeof userSchema>;

export type CanAccessSite = (
  user: {
    id: string;
    orgId: string;
    role: UserRole;
    siteId: string | null;
  },
  site: { id: string; orgId: string },
) => boolean;
