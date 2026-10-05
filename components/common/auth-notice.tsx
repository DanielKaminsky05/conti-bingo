import { InfoIcon } from "lucide-react"

/** Friendly explanations for where /auth/callback sends a failed email link. */
const NOTICES: Record<string, string> = {
  "link-used":
    "That link has already been used or has expired. If you already confirmed your email, just sign in below.",
  confirmed: "Your email is confirmed — sign in to continue.",
  "link-expired": "That reset link has expired or was already used. Request a new one below.",
}

export function AuthNotice({ notice }: { notice?: string }) {
  const message = notice ? NOTICES[notice] : undefined
  if (!message) return null
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"
    >
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{message}</span>
    </p>
  )
}
