"use client";

import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
  adminClient,
  inferAdditionalFields,
  jwtClient,
  twoFactorClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./server";

/** No `baseURL`: the auth API is served on this site's own origin, so the
 *  client resolves `/api/auth` against the document it was loaded from. A
 *  configured origin would have to be known when the bundle was built, and one
 *  published image serves any host. */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<Auth>(),
    usernameClient(),
    twoFactorClient(),
    passkeyClient(),
    adminClient(),
    apiKeyClient(),
    jwtClient(),
  ],
});
