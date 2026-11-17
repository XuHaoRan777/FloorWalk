import { z } from 'zod';
import {
  loginNameSchema,
  siteSchema,
  userRoleSchema,
  userSchema,
  uuid,
} from './identity.js';

export const storeManagerSummarySchema = userSchema.pick({
  id: true,
  displayName: true,
});

export const adminSiteSchema = siteSchema.extend({
  storeManagers: z.array(storeManagerSummarySchema),
});

export const adminUserSchema = userSchema.extend({
  site: siteSchema.nullable(),
  disabled: z.boolean(),
});

export const adminUsersResponseSchema = z.array(adminUserSchema);

export const createUserRequestSchema = z.object({
  loginName: loginNameSchema,
  displayName: z.string().trim().min(1),
  role: userRoleSchema,
  siteId: uuid.optional(),
  password: z.string().min(8),
});

export const updateUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    disabled: z.boolean().optional(),
    siteId: uuid.optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.disabled !== undefined ||
      value.siteId !== undefined,
  );

export const userResponseSchema = adminUserSchema;

export const updateMeRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(30),
  })
  .strict();

export const avatarUploadFieldName = 'file' as const;
export const avatarMimeTypes = ['image/jpeg', 'image/png'] as const;
export const maxAvatarSizeBytes = 2 * 1024 * 1024;
export const avatarUploadRequestSchema = z
  .object({
    file: z
      .object({
        fieldName: z.literal(avatarUploadFieldName),
        mimetype: z.enum(avatarMimeTypes),
        size: z.number().int().nonnegative().max(maxAvatarSizeBytes),
      })
      .strict(),
  })
  .strict();

export const avatarUploadResponseSchema = z.object({
  storageKey: z.string().min(1),
});

export const resetUserPasswordRequestSchema = z.object({
  password: z.string().min(8),
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export type AdminSite = z.infer<typeof adminSiteSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type ResetUserPasswordRequest = z.infer<
  typeof resetUserPasswordRequestSchema
>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;
export type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;
