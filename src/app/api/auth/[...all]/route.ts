import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// Sign up, sign in, verify email, reset password, sessions, delete account: all Better Auth.
export async function GET(req: Request) {
  return toNextJsHandler(auth()).GET(req);
}

export async function POST(req: Request) {
  return toNextJsHandler(auth()).POST(req);
}
