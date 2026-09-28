import { getInviteByToken } from "@/lib/queries/invites"
import { getCurrentUser } from "@/lib/auth/current-user"
import { publicStorageUrl } from "@/lib/storage-url"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { InviteAccept } from "./invite-accept"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  let invite
  try {
    invite = await getInviteByToken(token)
  } catch {
    invite = null
  }

  if (!invite) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>This invite is invalid or expired.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  const signedIn = Boolean(await getCurrentUser())
  const imageUrl = publicStorageUrl("group-images", invite.group_image_path)
  const roleLabel = invite.role === "admin" ? "an admin" : "a member"

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={invite.group_name}
              className="mx-auto size-18 rounded-2xl object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div className="mx-auto flex size-18 items-center justify-center rounded-2xl bg-muted text-2xl font-semibold text-muted-foreground">
              {invite.group_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="space-y-1">
            <CardTitle className="text-lg">{invite.group_name}</CardTitle>
            <CardDescription>You&apos;ll join as {roleLabel}.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <InviteAccept
            token={token}
            groupName={invite.group_name}
            signedIn={signedIn}
          />
        </CardContent>
      </Card>
    </main>
  )
}
