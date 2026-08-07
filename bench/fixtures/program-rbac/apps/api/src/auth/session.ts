// DOC: Existing session-auth layer. Bearer token scheme via the
// Authorization header. Must keep working unchanged while invitations/RBAC
// are added.
import { createSession, getSession, revokeSession, getUser } from "../../../../packages/db/src/db.ts";
import type { PublicUser } from "../../../../packages/contracts/src/types.ts";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function login(userId: string): { token: string; expiresAt: number } {
  const session = createSession(userId, SESSION_TTL_MS);
  return { token: session.token, expiresAt: session.expiresAt };
}

export function logout(token: string): boolean {
  return revokeSession(token);
}

export function authenticateSession(token: string | undefined): PublicUser | null {
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const user = getUser(session.userId);
  if (!user) return null;
  return { id: user.id, email: user.email };
}

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  return match ? match[1] : undefined;
}
