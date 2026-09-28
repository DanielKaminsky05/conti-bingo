import { listNotifications } from "@/lib/queries/notifications"
import { getCurrentUser } from "@/lib/auth/current-user"
import { NotificationList } from "@/components/notifications/notification-list"
import { EmptyState } from "@/components/common/empty-state"

export default async function NotificationsPage() {
  const user = await getCurrentUser()

  if (!user) {
    return (
      <EmptyState
        title="Notifications unavailable"
        description="Sign in to see your activity."
      />
    )
  }

  const initial = await listNotifications({ limit: 50, unreadOnly: false })

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      <h1 className="font-heading text-xl font-semibold">Notifications</h1>
      <NotificationList initial={initial} userId={user.id} />
    </div>
  )
}
