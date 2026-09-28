/** Public URL for an object in a public Storage bucket, or null. */
export function publicStorageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}
