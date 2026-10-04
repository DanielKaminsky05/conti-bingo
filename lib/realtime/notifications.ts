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
  // Unique channel name per subscriber: the header bell and the notification
  // center both subscribe, and Supabase reuses channels by name (a shared name
  // makes the 2nd `.on(...).subscribe()` throw "cannot add callbacks after subscribe()").
  return client
    .channel(`notifications:${userId}:${crypto.randomUUID()}`)
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
