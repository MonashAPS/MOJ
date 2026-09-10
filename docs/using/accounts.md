# Accounts and 2FA

Accounts are handled by Better Auth running inside the web app, with the tables in Postgres. The URLs are DMOJ's,
so `/accounts/login/`, `/accounts/register/` and the rest are where you expect them.

Accounts imported from an existing DMOJ site keep their password, their two-factor secret, their passkeys and
their API token. Nobody has to reset anything after a migration. See [importing from DMOJ](/admin/import).

## Registration

`/accounts/register/` asks for:

| Field | Rules |
| --- | --- |
| Username | Letters, digits and underscores, at most 30 characters. Availability is checked as you type. |
| Email | Checked against a disposable-address blocklist. |
| Password | At least 8 characters, not entirely numeric, not too similar to your username or email, and not one that has appeared in a breach. |
| Confirm password | Has to match. |
| Timezone | Sets how every date on the site is displayed for you. |
| Preferred language | Preselects the language on the submit page. |
| Organizations | Up to three, and only organisations that are open to join. Closed ones are joined by request afterwards. |

The breach check is Have I Been Pwned over k-anonymity, so only a five-character hash prefix leaves the server. A
match refuses the password on sign-up, password change and password reset. An operator running without outbound
network sets `HIBP_CHECK=off`.

Registration can be closed entirely from the staff console, in which case the page redirects to the login form.

## Activation

Registration sends an activation email. The link at `/accounts/activate/<key>/` is good for seven days; until it
is used the account exists but cannot sign in. Trying to sign in before then says so and offers to send the email
again.

Outside production, mail is written to the server console rather than sent, and
`/accounts/register/complete/` shows the activation link on the page, so a fresh install can be finished with no
mail server at all.

## Signing in

`/accounts/login/` takes a username or an email with a password, and offers a **Passkey** button beside it.

A passkey is a sign-in path of its own here, not only a second factor after a password: pressing the button and
answering the browser's prompt signs you in outright, and it also satisfies the second-factor requirement.

If the account has two-factor authentication, the password step hands over to `/accounts/login/2fa/`, which takes
a six-digit code from your authenticator app, or one of your scratch codes, or a passkey. Nothing is signed in
until that challenge is answered.

Sign-in, password reset requests, email changes and verification emails are each limited to ten a minute.

### If your password has been in a breach

The password on an existing account cannot be refused at the door, so instead the site notices and makes you
change it. The next page you open is `/accounts/password/change/` with a notice saying why, and nothing else is
reachable until the password is changed.

## Passwords

`/accounts/password/change/` changes a password you know, and signs out every other session while keeping the one
you are using.

`/accounts/password/reset/` sends a reset link, which lands on `/accounts/reset/confirm/<token>/`. The link works
once and expires after an hour. Asking to reset an address nobody has produces the same page as asking to reset
one that exists, so the form cannot be used to find out who has an account.

DMOJ's own reset URLs (`/accounts/password/reset/confirm/<token>/`, `/accounts/password/reset/done/` and
`/accounts/password/reset/complete/`) redirect to these, so an old link in an old email still lands in the right
place.

Accounts imported from DMOJ carry Django's `pbkdf2_sha256` hash. The first successful sign-in verifies against it
and then rewrites the stored hash in Better Auth's own format, so the migration is invisible and each legacy hash
is upgraded exactly once. An account whose hash begins with `!` was unusable on the old site as well, which is how
Django marks an account with no password; those users need a reset.

## Two-factor authentication

`/accounts/2fa/` is the two-factor page. An account can hold a TOTP secret and any number of passkeys at once.

### TOTP

`/accounts/2fa/enable/` enrols an authenticator app in three steps: confirm your password, scan the code, then
save the scratch codes. The QR code is drawn in your own browser rather than fetched as an image, so the secret
never travels as a URL; the key is also printed underneath for typing in by hand.

The account is not two-factor until a live code has been verified, which is what stops a mistyped setup locking
anyone out.

Codes are six digits on a 30 second period, accepted with one period of tolerance either side, so a phone with a
slightly wrong clock still works. If codes are consistently rejected, the phone's clock is wrong by more than
that; fix it in the phone's date and time settings rather than re-enrolling.

`/accounts/2fa/disable/` turns TOTP off. It asks for the password and for a current code or a scratch code.

### Scratch codes

Turning on two-factor generates five single-use scratch codes. Each one works once in place of a code from your
app. They are shown once, with buttons to copy or download them; keep them somewhere that is not the phone with
the authenticator on it.

The two-factor page shows how many are left and warns when you are down to one.
`/accounts/2fa/edit/` issues a fresh set of five and invalidates the old ones, after asking for your password
again. Do that after using one, and after anything that might have exposed the list.

Scratch codes are the only recovery path that does not involve a staff member. An account with two-factor on, no
scratch codes and no phone has to be recovered by an administrator.

### Passkeys

`/accounts/2fa/webauthn/attest/` registers and manages passkeys: a platform authenticator such as Touch ID or
Windows Hello, a hardware key, or a phone. Give each one a name you will recognise later. The same page lists what
is registered and removes one.

Passkeys are bound to the site's domain, which is set by `AUTH_RP_ID`. A passkey registered on
`judge.example.org` does not work on a staging site at another hostname, and moving the site to a new domain
invalidates every passkey. Register more than one, or keep TOTP as well, for that reason.

### Staff and two-factor

Accounts with the staff flag must hold a second factor. Every page redirects a staff member without one to
`/accounts/2fa/`, and the account pages and the profile editor are the only things reachable until one is
enrolled.

Staff also cannot remove their last factor. That rule is enforced on the endpoint, not only in the page, so it
holds however the request is made.

Granting someone staff sends them to the setup page on their next page load. Tell them first.

## API tokens

An API token authenticates a script as you against [the API](/reference/api). Tokens are 48 characters and are
sent as `Authorization: Bearer <token>`.

Generate one at `/accounts/api/token/generate/`. Give it a name that says what holds it, so you know which one to
revoke later, and pick the scopes it needs:

| Scope | Grants |
| --- | --- |
| `read` | Reading the API v2 endpoints, limited to what you can already see. |
| `problems:write` | Creating and updating problems, and uploading statement images, through the problems API. This is what a problem repository's CI needs. |

Staff have a second place to do the same thing, `/admin/api-keys`, which also offers a `problems:read` scope and
prints the workflow snippet and the problems API base URL to paste into a repository. Either page mints the same
kind of key.

The token is shown once. Only its hash is stored, so a lost token is replaced rather than recovered. Revoke a
token from the same page; revocation takes effect immediately.

A token never has more access than its owner. It carries the owner's permissions, so a token belonging to a staff
member is a staff credential and should be treated as one.

A token imported from DMOJ keeps working, and is listed separately as the token from the old site. Revoke it once
your scripts have moved to a new one. Legacy tokens only verify while the deployment carries the old site's
`SECRET_KEY` as `LEGACY_SECRET_KEY`; without it they are simply rejected and new tokens still work.

## Changing your email

`/accounts/email/change/` asks for the new address and your password. The confirmation link goes to the **new**
address and nothing changes until it is used, so a typo cannot lock you out. The old address is emailed a warning
that somebody asked, which is what makes the change safe to allow at all.

The link is good for seven days.

## Data export

`/data/prepare/` builds an export of what the site holds about you. Choose whether to include comments and
submissions, and optionally narrow submissions by a problem-code glob and by result.

The export runs as a background job, so the page shows live progress rather than timing out. When it finishes,
**Download prepared data** takes you to `/data/download/`, which hands you a zip containing one file per
submission with its source, one file per comment, and an `info.json` beside each with the metadata.

You may prepare one export a day. Building one reads every submission you have ever made, which is why.
