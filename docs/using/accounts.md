# Accounts and 2FA

Accounts are handled by Better Auth running inside the web app, with the tables in Postgres. The URLs are DMOJ's,
so `/accounts/login/`, `/accounts/register/` and the rest are where you expect them.

Accounts imported from an existing DMOJ site keep their password, their two-factor secret, their passkeys and their
API token. Nobody has to reset anything after a migration. See [importing from DMOJ](/admin/import).

## Registration

`/accounts/register/` asks for:

| Field | Rules |
| --- | --- |
| Username | Letters, digits and underscores, at most 30 characters. Case is preserved for display but usernames are unique case-insensitively. It is permanent; changing one is a staff action. |
| Email | Has to be deliverable, and is checked against a disposable-address blocklist. |
| Password | Checked against Have I Been Pwned using k-anonymity, so only a five-character hash prefix leaves the browser. A match is a warning, not a refusal. |
| Timezone | Sets how every date on the site is displayed for you. |
| Preferred language | Preselects the language on the submit page. |
| Organisations | Up to three, and only organisations that are open to join. Closed organisations are joined by request afterwards. |

Registration is rate limited per address.

## Activation

Registration sends an activation email. The link at `/accounts/activate/<key>/` is valid for seven days; until it
is used the account exists but cannot sign in. Requesting a new email invalidates the previous link.

In development, email is written to the console instead of being sent, so the activation link is in the terminal
running `npm run dev`. In production it goes through SES when the `SES_*` environment variables are set.

If an activation link has expired, ask for a new one from the login page rather than registering again; the
username is already taken by the inactive account.

## Passwords

`/accounts/password/change/` changes a password you know. `/accounts/password/reset/` sends a reset link, which
lands on `/accounts/reset/confirm/<token>/`. Reset requests are rate limited.

Accounts imported from DMOJ carry Django's `pbkdf2_sha256` hash. The first successful login verifies against it and
then rewrites the stored hash in Better Auth's own format, so the migration is invisible to the user and each
legacy hash is upgraded exactly once. An account whose hash begins with `!` was unusable on the old site as well,
which is how Django marks an account with no password; those users need a reset.

Changing your email at `/accounts/email/change/` sends a confirmation to the new address, and the change only
applies once that link is used.

## Two-factor authentication

`/accounts/2fa/` is the two-factor page. Three factor types are supported, and an account can have more than one at
a time.

### TOTP

`/accounts/2fa/enable` shows a QR code and the secret in text. Scan it with any authenticator app, then confirm
with a current code to turn it on. Confirmation matters: it stops an account being locked out by a
mistyped setup.

Codes are accepted with one period of tolerance either side, which is 30 seconds, so a phone with a slightly wrong
clock still works. If codes are consistently rejected, the phone's clock is wrong by more than that; fix it in the
phone's date and time settings rather than re-enrolling.

### Scratch codes

Turning on two-factor generates five single-use scratch codes. Each one works once in place of a TOTP code.
Download or print them and keep them somewhere that is not the phone with the authenticator on it.

`/accounts/2fa/scratchcode/generate` issues a fresh set of five and invalidates the old ones. Do that after using
one, and after anything that might have exposed the list.

Scratch codes are the only recovery path that does not involve a staff member. An account with two-factor on and
no scratch codes and no phone has to be recovered by an administrator.

### Passkeys

`/accounts/2fa/webauthn/attest` registers a passkey: a platform authenticator such as Touch ID or Windows Hello, a
hardware key such as a YubiKey, or a phone over Bluetooth. `/accounts/2fa/webauthn/assert` is the sign-in flow.

Passkeys are bound to the site's domain, which is set by `AUTH_RP_ID`. A passkey registered on
`judge.monashaps.com` does not work on a staging site at another hostname, and moving the site to a new domain
invalidates every passkey. Registering a second factor as well as a passkey is a good idea for that reason.

Register more than one passkey if a hardware key is your only factor. A lost key with no second passkey and no
scratch codes means account recovery by a staff member.

### Turning it off

`/accounts/2fa/disable` asks for a current factor and then removes two-factor. Staff accounts cannot do this, see
below.

### Staff and two-factor

Users with the staff flag must have two-factor enabled. The middleware enforces it on every request: a staff member
without a factor is redirected to the setup page and cannot use the site until one is enrolled, and a staff member
cannot remove their last factor.

The check is on the staff flag, so granting someone staff sends them to the setup page on their next page load.
Tell them first.

## API tokens

An API token authenticates a script as you against [the API](/reference/api). Tokens are 48 characters and are sent
as `Authorization: Bearer <token>`.

Generate one at `/accounts/api/token/generate/`, or from the API keys panel on **Edit profile**. Choose the scopes
the token needs:

| Scope | Grants |
| --- | --- |
| `read` | Read access to the API v2 endpoints, limited to what you can already see. |
| `problems:write` | Creating and updating problems through the problems API. This is the scope a problem repository's CI needs. |

A token never has more access than its owner. A token with `problems:write` belonging to someone who can only edit
their own problems can only write those problems.

The token is shown once. Only its hash is stored, so a lost token is replaced rather than recovered. Revoke a token
from the same panel; revocation takes effect immediately.

Tokens imported from DMOJ keep working: they are verified against the old site's key until the first use, and
carried forward.

The admin part of the site is deliberately not reachable with a token. Staff console actions need a session.

## Data export

`/data/prepare/` starts an export of everything the site holds about you: your profile, your submissions with their
source code, your comments and your contest participations.

The export runs as a job, so the page shows a progress bar and updates as it goes rather than timing out. When it
finishes, `/data/download/` serves a zip file. The download link is yours alone and the archive is removed after a
while, so fetch it reasonably soon.

There is a rate limit on preparing exports, recorded as `dataLastDownloaded` on your profile, because building one
reads every submission you have ever made.
