// Shared domain types. Extend this file (rather than redefining shapes
// locally) when adding new persisted entities — the rest of the codebase
// imports from here.

export type Role = "admin" | "member";

export interface Org {
  id: string;
  name: string;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  passwordHash: string;
}

export interface Session {
  token: string;
  userId: string;
  orgId: string;
  createdAt: number;
  expiresAt: number;
}

// DOC: audit scaffolding. Any privileged mutation (session-affecting or
// otherwise) should append one AuditEvent via persistence/db.ts::addAuditEvent.
// action is a short machine-readable verb, e.g. "user.login", "org.created".
export interface AuditEvent {
  id: string;
  orgId: string;
  actorUserId: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  orgId: string;
  email: string;
  role: Role;
}
