import { getCurrentProfile } from "@/lib/auth/current-user"
import { AvatarUploader } from "@/components/profile/avatar-uploader"
import { ProfileForm } from "@/components/profile/profile-form"
import { EmptyState } from "@/components/common/empty-state"

export default async function ProfilePage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    return (
      <EmptyState
        title="Profile unavailable"
        description="We couldn't load your profile. Try signing in again."
      />
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-8 py-4">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          Update how you show up to your groups.
        </p>
      </div>
      <AvatarUploader profile={profile} />
      <ProfileForm profile={profile} />
    </div>
  )
}
