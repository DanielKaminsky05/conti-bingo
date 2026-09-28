import { z } from 'zod'

export const signUpSchema = z.object({
  email: z.email('Enter a valid email address.'),
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name is too long.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

export const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

export const resendSchema = z.object({
  email: z.email('Enter a valid email address.'),
})

export type SignUpInput = z.infer<typeof signUpSchema>
export type SignInInput = z.infer<typeof signInSchema>
export type ResendInput = z.infer<typeof resendSchema>
