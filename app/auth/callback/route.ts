import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * A6 — Handle the email-confirmation link: exchange the `code` for a session,
 * then redirect. The redirect target (`next` / `redirect_to`) is same-origin
 * guarded to prevent open redirects.
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

  if (!code) {
    return new NextResponse('Missing confirmation code.', { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return new NextResponse('Could not confirm your email. The link may have expired.', {
      status: 400,
    })
  }

  return NextResponse.redirect(new URL(destination, origin))
}
