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

- `{{ .ConfirmationURL }}` — the action link (used in all three).
- `{{ .NewEmail }}` — the new address (used in `change-email.html`).

Keep those tokens exactly as written.

## ⚠️ The link still depends on URL config

`{{ .ConfirmationURL }}` is only built from your production domain if that domain
is allowed. Otherwise Supabase falls back to the **Site URL** (which defaults to
`http://localhost:3000`). So also set:

**Dashboard → Authentication → URL Configuration**
- **Site URL** → your production URL (e.g. `https://<your-app>.vercel.app`)
- **Redirect URLs** → add `https://<your-app>.vercel.app/**` (and keep
  `http://localhost:3000/**` for local dev)

Otherwise confirmation links will keep pointing at localhost.

## Design notes

- Brand green `#6aaa64`, off-white `#faf9f6` — matches the app theme.
- Table-based layout + inline CSS so it renders in Gmail / Outlook / Apple Mail
  (they strip `<style>` blocks and don't support flex/grid).
