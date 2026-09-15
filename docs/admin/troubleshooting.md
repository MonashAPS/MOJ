# Troubleshooting

Read the judge's log first: `docker logs --tail 100 moj-judge` answers most of these.

## Judging

| Symptom | Cause | Fix |
| --- | --- | --- |
| Not on `/status/` | `MOJ_URL` points at the web app or the client API | `curl -i "$MOJ_URL/health"`. JSON is the right host; HTML is the web app. |
| Rejected at the handshake | `JUDGE_NAME` is not a judge in the console | There is no automatic registration. |
| Rejected with a 403 | The key does not match | Compare `printf %s "$JUDGE_KEY" \| sha256sum` with the stored hash, or issue a new key. |
| Flapping online and offline | Two containers share one name | Give the second its own record. |
| Refused entirely | Blocked or disabled in the console | Both are switches on its row. |
| Every claim times out in development | A host firewall filters the Docker bridge | Use the `judge` profile, which is on host networking. |
| TLS fails on the judge box | Clock skew | `timedatectl` |
| Queued, nothing claims it | No judge is online | `/status/` |
| Queued | No online judge has that problem or language | The judge's row lists both. Fix the data, then `docker restart moj-judge`. |
| Queued | Pinned to an offline judge | It waits for that judge. |
| Queued while another tier is idle | Only the lowest online tier claims | Disable the hung judge. |
| A rejudge crawls | Rejudge priorities are skipped while the tier is busy | It speeds up when things go quiet. Watch `/admin/jobs/`. |
| Stuck in Processing | A judge claimed it and died | Requeued after 60 s without a heartbeat or 15 min without progress; a second failure is an internal error. |

## Sign-in and deployment

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every page behaves as though signed out, slowly | The backend cannot fetch the keys at `AUTH_JWKS_URL` | `npx convex env get AUTH_JWKS_URL`. In production it must reach `https://<domain>/api/auth/jwks`. |
| The same, in development | A host firewall filters the Docker bridge | `npm run setup` inlines the key set as a `data:` URI and leaves `AUTH_URL` unset. Rotating the signing keys then needs another `npm run setup`. |
| `npx convex deploy` cannot authenticate | A missing or unquoted variable | Both `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` are needed, and the key contains a `\|`. Generate another with `exec convex-backend ./generate_admin_key.sh`; old keys stay valid. |
| `No CONVEX_DEPLOYMENT set` | `.env.local` is missing or names a dead deployment | `npm run setup` |
| `Hex-decoded key was 31 bytes, not 32` | `INSTANCE_SECRET` is not 64 hex characters | `openssl rand -hex 32` |
| Stored data is suddenly unreadable | `INSTANCE_SECRET` changed | Put the old value back, or restore from an export. |
| The backend connects to a database and exits | The database does not exist | `infra/scripts/postgres-init/01-databases.sh` only runs on a fresh volume. |
| Missing table errors | The migrations have not run | `npm run db:migrate -w apps/web` |
| Port 5433 is in use | Something else holds the published port | `ss -ltnp \| grep 5433` |
| Read-only with errors in the log | Full disk | `df -h`, always first. |
| A fallback font | The fonts were not copied into the image | `exec web ls public/fonts` |
| PDF statements fail | The rendering binary is missing | `exec web typst --version`, or set `TYPST_BIN`. The error is on `/admin/jobs/`. |
| Maths appears as plain text with braces | The maths stylesheet did not load | The CSS is missing, not the maths. |
| The theme does not stick | Signed out, it is per-browser | Signed in it follows the account; the default is on `/admin/config/branding/`. |

```bash
# Create a missing database and migrate
docker compose -f infra/compose.prod.yml --project-directory . exec postgres \
  psql -U moj -c 'CREATE DATABASE moj_auth OWNER moj'
npm run db:migrate -w apps/web
```

## Resetting a development stack

```bash
# everything, including both databases
docker compose -f infra/compose.dev.yml --project-directory . down -v
rm -f .env.local apps/web/.env.local
npm run setup

# keep the data: re-push the functions, re-seed, or re-seed over existing rows
npx convex dev --once
npx convex run seed:run '{}'
npx convex run seed:run '{"force": true}'
```

## Everything is slow

Check `/status/` for judge load, `/admin/jobs/` for a running batch rejudge, `docker stats` for a container out
of memory, `df -h` for disk, and the dashboard's logs for functions that are erroring.
