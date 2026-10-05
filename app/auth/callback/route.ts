import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * A6 — Handle a PKCE email link (`{{ .ConfirmationURL }}` → Supabase /verify →
 * here with `?code=`): exchange the code for a session, then redirect. The
 * redirect target (`next` / `redirect_to`) is same-origin guarded to prevent
 * open redirects.
 *
 * Failures never dead-end on a plain-text page — they go somewhere useful:
 *  - no `code`: Supabase already rejected the link (its error sits in the URL
 *    #fragment, which never reaches the server). Almost always the token was
 *    used already — by an earlier click, or by a mail scanner (Microsoft Safe
 *    Links) that opened the link first, which also CONFIRMS the account.
 *  - exchange fails: the link was verified (so the email IS confirmed) but this
 *    browser lacks the PKCE verifier — e.g. signed up on a laptop, opened the
 *    email on a phone.
 * New emails link to /auth/confirm instead (scanner-safe, any browser).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? searchParams.get('redirect_to') ?? '/'

  // Same-origin guard: resolve the requested target against our origin and
  // reject anything that escapes it (absolute off-origin URLs, protocol-relative
  // `//evil.com`, etc.).
  let destination: string
  try {
    const resolved = new URL(rawNext, origin)
    if (resolved.origin !== origin) {
      return new NextResponse('Invalid redirect target.', { status: 400 })
    }
    destination = resolved.pathname + resolved.search + resolved.hash
  } catch {
    return new NextResponse('Invalid redirect target.', { status: 400 })
  }

  const isRecovery = destination.startsWith('/reset-password')
  const fallback = (notice: string) =>
    NextResponse.redirect(
      new URL(isRecovery ? '/forgot-password?notice=link-expired' : `/login?notice=${notice}`, origin)
    )

  if (!code) return fallback('link-used')

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return fallback('confirmed')

  return NextResponse.redirect(new URL(destination, origin))
}
