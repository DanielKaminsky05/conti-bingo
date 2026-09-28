import { z } from 'zod'

/** P1/P2 — reference an authored card by id. */
export const cardIdSchema = z.object({
  cardId: z.string().uuid('A valid card id is required.'),
})

/** P2 — reference a materialized player card by id. */
export const playerCardIdSchema = z.object({
  playerCardId: z.string().uuid('A valid player card id is required.'),
})

/** P3 — toggle a single square on the caller's own player card. */
export const markCellSchema = z.object({
  playerCardId: z.string().uuid('A valid player card id is required.'),
  position: z.number().int('Position must be an integer.').min(0, 'Position must be ≥ 0.'),
  marked: z.boolean(),
})

export type CardIdInput = z.infer<typeof cardIdSchema>
export type PlayerCardIdInput = z.infer<typeof playerCardIdSchema>
export type MarkCellInput = z.infer<typeof markCellSchema>
