import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { authSchemaOptions } from "./auth-options";
import { pool, tx } from "./db";
import { sendEmail, resetPasswordMessage, verifyEmailMessage } from "./email";
import { env, isProd } from "./env";

function build() {
  const e = env();
  const base = authSchemaOptions();
  return betterAuth({
    ...base,
    appName: "Restaurant POS",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: pool(),
    trustedOrigins: [e.APP_URL],
    emailAndPassword: {
      ...base.emailAndPassword!,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => sendEmail(resetPasswordMessage(user.email, url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => sendEmail(verifyEmailMessage(user.email, user.name, url)),
    },
    socialProviders:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } } : undefined,
    user: {
      deleteUser: {
        enabled: true,
        // Deleting your account removes you. A restaurant you alone own is closed: its customers'
        // personal data is erased now, but bills stay, because GST law requires keeping invoices
        // for 72 months. See replica/backend.md "Account deletion".
        beforeDelete: async (user) => {
          await tx(async (c) => {
            const sole = await c.query(
              `select m.org_id from org_members m
               where m.user_id = $1 and m.role = 'owner'
                 and not exists (select 1 from org_members o where o.org_id = m.org_id and o.role = 'owner' and o.user_id <> $1)`,
              [user.id],
            );
            for (const { org_id } of sole.rows) {
              await c.query("update organizations set status = 'cancelled' where id = $1", [org_id]);
              await c.query(
                `update customers set name = null, email = null, gstin = null, addresses = '[]', birthday = null, anniversary = null,
                   phone = 'erased-' || id, tags = '{}', marketing_opt_in = false, deleted_at = now() where org_id = $1`,
                [org_id],
              );
              await c.query("update devices set token_hash = null, revoked_at = now() where org_id = $1", [org_id]);
              await c.query("insert into jobs (kind, payload) values ('subscription.cancel', $1)", [JSON.stringify({ orgId: org_id })]);
            }
          });
        },
      },
    },
    advanced: { useSecureCookies: isProd() },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof build>;
const g = globalThis as { __kkAuth?: Auth };

/** Created on first use, not at import, so `next build` doesn't need secrets. */
export function auth(): Auth {
  return (g.__kkAuth ??= build());
}
