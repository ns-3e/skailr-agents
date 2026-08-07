// DOC: Existing session-auth layer. Session tokens are opaque bearer tokens
// (see persistence/db.ts::createSession). This must keep working unchanged
// while the API-key auth scheme is added alongside it.
import { createSession, getSession, revokeSession, getUser } from "../persistence/db.ts";
import type { PublicUser, Session } from "../types.ts";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function login(userId: string, orgId: string): Session {
  return createSession(userId, orgId, SESSION_TTL_MS);
}

export function logout(token: string): boolean {
  return revokeSession(token);
}

export interface AuthResult {
  user: PublicUser;
  orgId: string;
}

export function authenticateSession(token: string | undefined): AuthResult | null {
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const user = getUser(session.userId);
  if (!user) return null;
  return {
    orgId: session.orgId,
    user: { id: user.id, orgId: user.orgId, email: user.email, role: user.role },
  };
}

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  return match ? match[1] : undefined;
}
