import { z } from 'zod'

/** V1 createInvite — email optional, role defaults to member, optional expiry. */
export const createInviteSchema = z.object({
  groupId: z.string().uuid(),
  email: z.string().email('Enter a valid email address.').optional(),
  role: z.enum(['member', 'admin']).default('member'),
  expiresInHours: z.number().int().positive().optional(),
})
export type CreateInviteInput = z.infer<typeof createInviteSchema>

/** V3 revokeInvite — invite identifier. */
export const inviteIdSchema = z.object({
  inviteId: z.string().uuid(),
})
export type InviteIdInput = z.infer<typeof inviteIdSchema>

/** V4/V5 — invite token from a share link. */
export const tokenSchema = z.object({
  token: z.string().min(1, 'A token is required.'),
})
export type TokenInput = z.infer<typeof tokenSchema>
