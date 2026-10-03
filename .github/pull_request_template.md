## What changed

<!-- A sentence or two. What a reviewer needs to know before reading the diff,
     and why, if the title does not already say it. -->

## How it was checked

<!-- What you ran and what it said. "pnpm test: 1077 passed" beats "tested".
     Say if something could not be checked, and why. -->

## Watch out for

<!-- Behaviour that changes for people already using the site, anything a diff
     will not show, and known follow-ups. "Nothing" is a fine answer. -->

## After merging

<!-- Optional: delete this section when a deployment needs nothing. Otherwise
     the steps it does need, such as a mutation to run, an image to rebuild, or
     a setting to add in the console. -->

---

- [ ] `pnpm run lint`, `pnpm run typecheck` and `pnpm test` pass
- [ ] Routes, field names and behaviour match DMOJ where DMOJ has them
- [ ] Docs updated if behaviour changed
- [ ] No secrets, `.env` files, `node_modules` or `package-lock.json` in the diff
