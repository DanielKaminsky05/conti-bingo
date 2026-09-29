import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth/current-user"
import { ResetPasswordForm } from "./reset-password-form"

export default async function ResetPasswordPage() {
  // The recovery link (via /auth/callback) establishes a session. Without one
  // the link is invalid or has expired.
  const user = await getCurrentUser()

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link expired or invalid</CardTitle>
          <CardDescription>
            This password reset link is no longer valid. Request a new one to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/forgot-password"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Request a new reset link
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  )
}
