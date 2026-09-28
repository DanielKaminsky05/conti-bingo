import { z } from 'zod'

export const updateProfileSchema = z.object({
  username: z
    .string()
    .regex(
      /^[a-z0-9_]{3,20}$/,
      'Username must be 3–20 characters using lowercase letters, numbers, or underscores.'
    ),
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name is too long.'),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
