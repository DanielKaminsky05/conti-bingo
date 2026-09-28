import { z } from 'zod'

/**
 * N1 — Paging/filtering for the recipient's notification feed. `unreadOnly`
 * restricts to rows with `read_at is null`; `limit` caps the page size.
 */
export const listNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  unreadOnly: z.boolean().default(false),
})

export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>

/**
 * N2 — Mark one notification read (by `id`) or, when `id` is omitted, mark all
 * of the caller's unread notifications read.
 */
export const markReadSchema = z.object({
  id: z.string().uuid('Invalid notification id.').optional(),
})

export type MarkReadInput = z.infer<typeof markReadSchema>
