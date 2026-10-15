import "server-only";
import { z } from "zod";

// Every server setting in one place, validated once. Names match .env.example.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().min(24).optional(),
  // Email (Resend). Without a key, emails are kept in the jobs table and logged: dev only.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Restaurant POS <no-reply@example.com>"),
  // Local production-mode testing only: keep emails in the jobs table instead of sending.
  // Refused unless APP_URL is localhost.
  ALLOW_DEV_EMAIL: z.stringbool().default(false),
  // Google sign-in (optional): your own OAuth client.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Razorpay subscriptions (test keys until /replica-deploy).
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_CORE: z.string().optional(),
  RAZORPAY_PLAN_GROWTH: z.string().optional(),
  RAZORPAY_PLAN_SCALE: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Invalid server environment:\n" + parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
    }
    const local = ["localhost", "127.0.0.1"].includes(new URL(parsed.data.APP_URL).hostname);
    if (parsed.data.ALLOW_DEV_EMAIL && !local) throw new Error("ALLOW_DEV_EMAIL only works with a localhost APP_URL.");
    if (parsed.data.NODE_ENV === "production" && !parsed.data.RESEND_API_KEY && !parsed.data.ALLOW_DEV_EMAIL) {
      throw new Error("RESEND_API_KEY is required in production (verification and reset emails).");
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
