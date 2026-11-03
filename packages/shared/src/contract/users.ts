import { z } from 'zod';
import { siteSchema, userRoleSchema, userSchema, uuid } from './identity.js';

export const supervisorSummarySchema = userSchema.pick({
  id: true,
  displayName: true,
});

export const adminSiteSchema = siteSchema.extend({
  supervisor: supervisorSummarySchema.nullable(),
});

export const setSiteSupervisorRequestSchema = z.object({
  userId: uuid.nullable(),
});

export const setSiteSupervisorResponseSchema = adminSiteSchema;

export const adminUserSchema = userSchema.extend({
  site: siteSchema.nullable(),
  disabled: z.boolean(),
});

export const adminUsersResponseSchema = z.array(adminUserSchema);

export const createUserRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  role: userRoleSchema,
  siteId: uuid.optional(),
  password: z.string().min(8),
});

export const updateUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    disabled: z.boolean().optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.disabled !== undefined,
  );

export const userResponseSchema = adminUserSchema;

export const resetUserPasswordRequestSchema = z.object({
  password: z.string().min(8),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export type AdminSite = z.infer<typeof adminSiteSchema>;
export type SetSiteSupervisorRequest = z.infer<
  typeof setSiteSupervisorRequestSchema
>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type ResetUserPasswordRequest = z.infer<
  typeof resetUserPasswordRequestSchema
>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
