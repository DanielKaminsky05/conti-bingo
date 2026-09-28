import { z } from 'zod'

/**
 * Zod schemas for the Cards bucket (C1/C3/C6/C8).
 *
 * Enforces the documented card rules (api-endpoints.md C1, decisions.md D5/D6/D7):
 *  - `gridSize ∈ {4,5,6}`
 *  - `freeSpace` only on odd grids (5×5) — D6
 *  - challenge count fits the grid: `>= gridSize² − (freeSpace ? 1 : 0)`
 *  - `points > 0`
 *  - `endsAt > startsAt` when both are set
 */

/** A single authored challenge (square) with an optional weighted point value (D7). */
export const challengeInputSchema = z.object({
  text: z.string().trim().min(1, 'Challenge text is required.').max(300, 'Challenge text is too long.'),
  points: z.number().int('Points must be a whole number.').positive('Points must be greater than zero.').default(1),
})

export type ChallengeInput = z.infer<typeof challengeInputSchema>

const gridSizeSchema = z.union([z.literal(4), z.literal(5), z.literal(6)])
const layoutModeSchema = z.enum(['shuffled', 'identical'])
const winConditionSchema = z.enum(['line', 'blackout'])

/**
 * Shared refinements applied to any object carrying the structural card fields.
 * Only checks a rule when the fields it depends on are present, so it can be
 * reused for both full creates and partial updates.
 */
function refineCardShape(
  data: {
    gridSize?: number
    freeSpace?: boolean
    challenges?: ChallengeInput[]
    startsAt?: string
    endsAt?: string
  },
  ctx: z.RefinementCtx
) {
  const { gridSize, freeSpace, challenges, startsAt, endsAt } = data

  // D6 — free space only on odd grids (5×5).
  if (freeSpace === true && gridSize !== undefined && gridSize % 2 === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['freeSpace'],
      message: 'Free space is only allowed on odd grids (5×5).',
    })
  }

  // Challenge count must fill the grid (minus the free space when enabled).
  if (gridSize !== undefined && challenges !== undefined) {
    const required = gridSize * gridSize - (freeSpace ? 1 : 0)
    if (challenges.length < required) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['challenges'],
        message: `Need at least ${required} challenges for a ${gridSize}×${gridSize} grid${
          freeSpace ? ' with a free space' : ''
        }.`,
      })
    }
  }

  // Schedule ordering.
  if (startsAt !== undefined && endsAt !== undefined && new Date(endsAt) <= new Date(startsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'End time must be after the start time.',
    })
  }
}

/** C1 — author a new card (created as a draft). */
export const createCardSchema = z
  .object({
    groupId: z.string().uuid('A valid group id is required.'),
    title: z.string().trim().min(1, 'Title is required.').max(120, 'Title is too long.'),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
    gridSize: gridSizeSchema,
    layoutMode: layoutModeSchema,
    freeSpace: z.boolean(),
    winCondition: winConditionSchema.default('line'),
    startsAt: z.string().datetime({ message: 'Start time must be a valid date-time.' }).optional(),
    endsAt: z.string().datetime({ message: 'End time must be a valid date-time.' }).optional(),
    challenges: z.array(challengeInputSchema).min(1, 'Add at least one challenge.'),
  })
  .superRefine(refineCardShape)

export type CreateCardInput = z.infer<typeof createCardSchema>

/**
 * C3 — edit an existing card. All structural/content fields are optional
 * (edit-anytime, D5); the same refinements apply whenever the relevant fields
 * are present.
 */
export const updateCardSchema = z
  .object({
    cardId: z.string().uuid('A valid card id is required.'),
    title: z.string().trim().min(1, 'Title is required.').max(120, 'Title is too long.').optional(),
    description: z.string().trim().max(2000, 'Description is too long.').nullable().optional(),
    gridSize: gridSizeSchema.optional(),
    layoutMode: layoutModeSchema.optional(),
    freeSpace: z.boolean().optional(),
    winCondition: winConditionSchema.optional(),
    startsAt: z.string().datetime({ message: 'Start time must be a valid date-time.' }).nullable().optional(),
    endsAt: z.string().datetime({ message: 'End time must be a valid date-time.' }).nullable().optional(),
    challenges: z.array(challengeInputSchema).optional(),
  })
  .superRefine((data, ctx) =>
    refineCardShape(
      {
        gridSize: data.gridSize,
        freeSpace: data.freeSpace,
        challenges: data.challenges,
        startsAt: data.startsAt ?? undefined,
        endsAt: data.endsAt ?? undefined,
      },
      ctx
    )
  )

export type UpdateCardInput = z.infer<typeof updateCardSchema>

/** Identifier-only schemas for reads / publish. */
export const cardIdSchema = z.object({
  cardId: z.string().uuid('A valid card id is required.'),
})
export type CardIdInput = z.infer<typeof cardIdSchema>

export const groupIdSchema = z.object({
  groupId: z.string().uuid('A valid group id is required.'),
})
export type GroupIdInput = z.infer<typeof groupIdSchema>
