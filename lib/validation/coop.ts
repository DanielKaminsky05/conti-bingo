import { z } from 'zod'

/** Reference a co-op card by id (create/read its shared board). */
export const coopCardIdSchema = z.object({
  cardId: z.string().uuid('A valid card id is required.'),
})

/** Mark/unmark a single square on the group's shared co-op board. */
export const markCoopCellSchema = z.object({
  cardId: z.string().uuid('A valid card id is required.'),
  position: z.number().int('Position must be an integer.').min(0, 'Position must be ≥ 0.'),
  marked: z.boolean(),
})

export type CoopCardIdInput = z.infer<typeof coopCardIdSchema>
export type MarkCoopCellInput = z.infer<typeof markCoopCellSchema>
