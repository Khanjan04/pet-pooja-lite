import "server-only";
import { isProd } from "./env";

export const DEVICE_COOKIE = "kk_device";
export const STAFF_COOKIE = "kk_staff";

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** http-only, Secure in production, SameSite=Lax. maxAge in seconds; 0 clears. */
export function cookie(name: string, value: string, maxAge: number) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (isProd()) parts.push("Secure");
  return parts.join("; ");
}
