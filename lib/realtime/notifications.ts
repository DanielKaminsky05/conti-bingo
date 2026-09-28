import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/supabase/database.types'

/**
 * N3 — Subscribe to live changes on the caller's own `notifications` rows for a
 * real-time unread badge / notification center. Client-side helper: pass a
 * browser `SupabaseClient` and the signed-in user's id. `onChange` fires on every
 * insert/update/delete the recipient can see (RLS still applies server-side).
 *
 * Returns the subscribed channel; callers should `supabase.removeChannel(...)`
 * (or `channel.unsubscribe()`) on cleanup.
 */
export function subscribeToNotifications(
  client: SupabaseClient<Database>,
  userId: string,
  onChange: (payload: RealtimePostgresChangesPayload<Tables<'notifications'>>) => void
): RealtimeChannel {
  return client
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      onChange
    )
    .subscribe()
}
