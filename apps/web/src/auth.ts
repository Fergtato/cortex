import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

/** Better Auth client: same-origin, cookie sessions; apps/server serves it at the default /api/auth. */
export const authClient = createAuthClient({
  plugins: [adminClient()],
});
