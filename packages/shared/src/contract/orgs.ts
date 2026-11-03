import { z } from 'zod';
import { organizationSchema, userSchema } from './identity.js';

export const createOrgRequestSchema = z.object({
  orgName: z.string().trim().min(1),
  timezone: z.string().min(1).optional(),
  adminName: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const createOrgResponseSchema = z.object({
  org: organizationSchema,
  user: userSchema,
});

export type CreateOrgRequest = z.infer<typeof createOrgRequestSchema>;
export type CreateOrgResponse = z.infer<typeof createOrgResponseSchema>;
