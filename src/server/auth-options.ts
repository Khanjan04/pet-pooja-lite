// Better Auth options that shape the database. Shared by the running app (server/auth.ts)
// and the migration generator (scripts/gen-auth-migration.mts), so they never drift.

import type { BetterAuthOptions } from "better-auth";

export function authSchemaOptions(): Pick<BetterAuthOptions, "emailAndPassword" | "rateLimit" | "user" | "session"> {
  return {
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 10, revokeSessionsOnPasswordReset: true },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      // Anything that sends an email: a few per minute per address.
      customRules: {
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    user: { deleteUser: { enabled: true } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  };
}
