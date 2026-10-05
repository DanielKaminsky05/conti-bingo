# Email templates

Branded HTML for the Supabase auth emails Conti-Bingo sends. Copy each file's
contents into the matching template in the Supabase dashboard:

**Dashboard → Authentication → Emails → Templates**

| File | Supabase template | Triggered by |
|------|-------------------|--------------|
| `confirm-signup.html` | **Confirm signup** | `signUp` + "resend confirmation" (A1/A4) |
| `reset-password.html` | **Reset password** | "Forgot password" (A5) |
| `change-email.html` | **Change email address** | Changing email in profile settings |

Templates we don't use (leave as Supabase defaults): Invite user, Magic Link,
Reauthentication — the app is email + password and runs its own in-app group
invites.

## Template variables

Supabase substitutes these (Go template syntax):

- `{{ .SiteURL }}` — the dashboard **Site URL** (must be the production domain).
- `{{ .TokenHash }}` — the one-time token for the link.
- `{{ .NewEmail }}` — the new address (used in `change-email.html`).

Keep those tokens exactly as written.

## Why the links go to `/auth/confirm` (not `{{ .ConfirmationURL }}`)

Every link points at our own page:

| Template | Link |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| Change email | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` |

`{{ .ConfirmationURL }}` redeems the one-time token the moment the URL is
opened. Microsoft Safe Links (Ivey / UWO mailboxes) opens every link in an email
before the person sees it, so it confirmed the account and burned the token —
the student's own click then failed with "Missing confirmation code." It also
uses PKCE, which fails when the email is opened in a different browser than the
one used to sign up.

`/auth/confirm` does nothing on load; the token is redeemed (`verifyOtp`) only
when the person taps **Confirm**, in any browser. Old `{{ .ConfirmationURL }}`
emails still work through `/auth/callback`, which now redirects to a friendly
sign-in notice instead of a plain-text error.

## ⚠️ Check the Site URL

**Dashboard → Authentication → URL Configuration**
- **Site URL** → the production URL (`https://www.contibingo.com`) — the links
  above are built from it, so if it still says `http://localhost:3000` every
  email will point at localhost.
- **Redirect URLs** → keep `https://www.contibingo.com/**` (and
  `http://localhost:3000/**` for local dev) for the legacy callback links.

## Design notes

- Brand green `#6aaa64`, off-white `#faf9f6` — matches the app theme.
- Table-based layout + inline CSS so it renders in Gmail / Outlook / Apple Mail
  (they strip `<style>` blocks and don't support flex/grid).
