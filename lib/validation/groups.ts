import { z } from 'zod'

/** G1 createGroup — name 1–80, optional description ≤500. */
export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name must be 80 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer.')
    .optional(),
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>

/** G4 updateGroup — partial edits to name/description/join_locked. */
export const updateGroupSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name must be 80 characters or fewer.').optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer.')
    .nullable()
    .optional(),
  joinLocked: z.boolean().optional(),
})
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>

/** Shared single-group identifier (G2/G5/G7/G10). */
export const groupIdSchema = z.object({
  groupId: z.string().uuid(),
})
export type GroupIdInput = z.infer<typeof groupIdSchema>

/** G12 archiveGroup — flip status to archived/active. */
export const archiveGroupSchema = z.object({
  groupId: z.string().uuid(),
  archived: z.boolean(),
})
export type ArchiveGroupInput = z.infer<typeof archiveGroupSchema>

/** G11 updateMemberRole — owner sets a member's role (never 'owner'). */
export const updateMemberRoleSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member']),
})
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>

/** G9 removeMember — remove a member from a group. */
export const removeMemberSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
})
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>
