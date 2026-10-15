import "server-only";
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 32;

/** Random bearer token for cookies. Only its sha256 is stored. */
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** PINs are short, so the real defence is device binding + lockout; scrypt stops cheap offline guessing. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, key] = stored.split("$");
  if (algo !== "scrypt") return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(pin, Buffer.from(salt, "base64"), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(got, want);
}
