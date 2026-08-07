// DOC: In-memory persistence layer (fixture scope — a real deployment would
// back this with a database, but the pattern below — id-keyed Maps + narrow
// accessor functions, no ORM) is what any new persisted entity (e.g. API
// keys) should follow. All access goes through these functions; nothing
// outside this module touches the Maps directly.
import { randomUUID } from "node:crypto";
import type { Org, User, Session, AuditEvent } from "../types.ts";

const orgs = new Map<string, Org>();
const users = new Map<string, User>();
const usersByEmail = new Map<string, string>(); // email -> userId
const sessions = new Map<string, Session>(); // token -> Session
const auditEvents: AuditEvent[] = [];

export function createOrg(name: string): Org {
  const org: Org = { id: randomUUID(), name };
  orgs.set(org.id, org);
  return org;
}

export function getOrg(orgId: string): Org | undefined {
  return orgs.get(orgId);
}

export function createUser(input: { orgId: string; email: string; role: User["role"]; passwordHash: string }): User {
  const user: User = { id: randomUUID(), ...input };
  users.set(user.id, user);
  usersByEmail.set(user.email.toLowerCase(), user.id);
  return user;
}

export function getUser(userId: string): User | undefined {
  return users.get(userId);
}

export function findUserByEmail(email: string): User | undefined {
  const id = usersByEmail.get(email.toLowerCase());
  return id ? users.get(id) : undefined;
}

export function listUsersByOrg(orgId: string): User[] {
  return [...users.values()].filter((u) => u.orgId === orgId);
}

export function createSession(userId: string, orgId: string, ttlMs: number): Session {
  const now = Date.now();
  const session: Session = {
    token: randomUUID() + randomUUID(),
    userId,
    orgId,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  sessions.set(session.token, session);
  return session;
}

export function getSession(token: string): Session | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

export function revokeSession(token: string): boolean {
  return sessions.delete(token);
}

export function addAuditEvent(input: {
  orgId: string;
  actorUserId: string;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown>;
}): AuditEvent {
  const event: AuditEvent = {
    id: randomUUID(),
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: input.action,
    target: input.target ?? null,
    metadata: input.metadata ?? {},
    createdAt: Date.now(),
  };
  auditEvents.push(event);
  return event;
}

export function listAuditEvents(orgId: string): AuditEvent[] {
  return auditEvents.filter((e) => e.orgId === orgId);
}

// Test-only helper: reset all in-memory state between test files/cases.
export function __resetDbForTests(): void {
  orgs.clear();
  users.clear();
  usersByEmail.clear();
  sessions.clear();
  auditEvents.length = 0;
}
