// DOC: Secure secret hashing utility (existing). Used for user passwords.
// Reuse this pattern for any new secret material; never store a raw secret.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, KEY_LEN).toString("hex");
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  const derived = scryptSync(secret, salt, KEY_LEN);
  const expected = Buffer.from(derivedHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
