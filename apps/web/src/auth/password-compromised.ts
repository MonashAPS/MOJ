/** DMOJ sets `request.session.password_pwned` when a password that has appeared
 *  in a breach is used to log in, and then forces a change (judge/middleware.py).
 *  Sessions here live in Better Auth, so the flag rides on its own cookie: the
 *  login hook sets it, `src/proxy.ts` redirects on it, and a completed password
 *  change clears it. */
export const COMPROMISED_COOKIE = "moj-password-compromised";
