import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmForm } from "./confirm-form"

const COPY: Record<string, { title: string; description: string; action: string }> = {
  recovery: {
    title: "Reset your password",
    description: "Continue to choose a new password.",
    action: "Continue",
  },
  email_change: {
    title: "Confirm your new email",
    description: "Tap below to finish changing your email address.",
    action: "Confirm new email",
  },
}
const DEFAULT_COPY = {
  title: "Confirm your email",
  description: "One tap and you're in — your section awaits.",
  action: "Confirm my email",
}

/**
 * Landing page for email links (`?token_hash=…&type=…[&next=…]`). Deliberately
 * does NOTHING on load: link scanners (Microsoft Safe Links) open every URL in
 * an email, and redeeming the one-time token on GET let them burn it before
 * the person clicked. The token is only used when the button is pressed.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>
}) {
  const { token_hash: tokenHash, type, next } = await searchParams
  const copy = (type && COPY[type]) || DEFAULT_COPY

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-xl font-semibold">Contibingo</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenHash && type ? (
              <ConfirmForm tokenHash={tokenHash} type={type} next={next} action={copy.action} />
            ) : (
              <p className="text-sm text-destructive">
                This link is incomplete. Open the latest email we sent and try again.
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
      </div>
    </div>
  )
}
