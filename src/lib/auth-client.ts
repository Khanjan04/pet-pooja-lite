"use client";

import { createAuthClient } from "better-auth/react";

/** Talks to /api/auth/* on this origin (Better Auth). */
export const authClient = createAuthClient();

/** Better Auth error → a sentence we're happy to show. */
export function authMessage(e: { message?: string; status?: number; code?: string } | null | undefined, fallback: string) {
  if (!e) return fallback;
  if (e.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (e.code === "EMAIL_NOT_VERIFIED") return "Confirm your email first. We’ve sent the link again.";
  if (e.code === "INVALID_EMAIL_OR_PASSWORD") return "That email and password don’t match.";
  if (e.code === "USER_ALREADY_EXISTS" || e.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return "An account with this email already exists. Sign in instead.";
  if (e.code === "PASSWORD_TOO_SHORT") return "Use at least 10 characters for the password.";
  return e.message || fallback;
}
