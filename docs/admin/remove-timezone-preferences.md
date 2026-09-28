# Remove stored timezone preferences

Run from the repository root with the target Convex deployment and auth
`DATABASE_URL` configured.

1. **Deploy the current backend and web app.** The retired fields remain optional;
   nothing writes them. Older open forms need a refresh.

   ```sh
   npm run convex:deploy
   ```

2. **Run cleanup against production:**

   ```sh
   npx convex run --prod maintenance:removeTimezonePreferences '{"table":"profiles"}'
   npx convex run --prod maintenance:removeTimezonePreferences '{"table":"siteSettings"}'
   ```

   If either returns `isDone: false`, repeat with its returned `cursor` until both
   finish:

   ```sh
   npx convex run --prod maintenance:removeTimezonePreferences '{"table":"profiles","cursor":"PASTE_RETURNED_CURSOR"}'
   ```

3. **Apply the auth SQL migration** after older web instances have stopped:

   ```sh
   npm run db:migrate --workspace apps/web
   ```

4. **In a separate commit**, remove `profiles.timezone` and
   `siteSettings.defaultUserTimezone` and their comments from `convex/schema.ts`.
   Deploy again with `npm run convex:deploy`. Schema validation verifies no old
   fields remain. If it fails, finish cleanup and retry.

For development, use `npx convex dev --once` for each deployment and omit `--prod`
from cleanup commands. Clean up each environment before deploying the final schema.
