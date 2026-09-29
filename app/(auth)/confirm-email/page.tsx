import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ResendForm } from "./resend-form"

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          {email
            ? `We sent a confirmation link to ${email}. Click it to activate your account.`
            : "We sent you a confirmation link. Click it to activate your account."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {email ? (
          <ResendForm email={email} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Need a confirmation link?{" "}
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
              Sign up
            </Link>{" "}
            with your email first.
          </p>
        )}
        <p className="text-center text-sm text-muted-foreground">
          Already confirmed?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
