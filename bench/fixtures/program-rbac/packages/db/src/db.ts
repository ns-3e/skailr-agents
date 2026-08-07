// DOC: In-memory persistence layer (fixture scope — a real deployment would
// back this with a database). Id-keyed Maps + narrow accessor functions,
// no ORM. New persisted entities (e.g. invitations) should follow this same
// pattern and can live in this file or a sibling file re-exported the same
// way. All cross-package access goes through these functions.
import { randomUUID } from "node:crypto";
import type { Org, User, OrgMember, Session, Role } from "../../contracts/src/types.ts";

const orgs = new Map<string, Org>();
const users = new Map<string, User>();
const usersByEmail = new Map<string, string>(); // email -> userId
const members = new Map<string, OrgMember>(); // `${orgId}:${userId}` -> OrgMember
const sessions = new Map<string, Session>(); // token -> Session

function memberKey(orgId: string, userId: string): string {
  return `${orgId}:${userId}`;
}

export function createOrg(name: string): Org {
  const org: Org = { id: randomUUID(), name };
  orgs.set(org.id, org);
  return org;
}

export function getOrg(orgId: string): Org | undefined {
  return orgs.get(orgId);
}

export function createUser(input: { email: string; passwordHash: string }): User {
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

export function addMember(orgId: string, userId: string, role: Role): OrgMember {
  const member: OrgMember = { orgId, userId, role };
  members.set(memberKey(orgId, userId), member);
  return member;
}

export function getMember(orgId: string, userId: string): OrgMember | undefined {
  return members.get(memberKey(orgId, userId));
}

export function listMembers(orgId: string): OrgMember[] {
  return [...members.values()].filter((m) => m.orgId === orgId);
}

export function removeMember(orgId: string, userId: string): boolean {
  return members.delete(memberKey(orgId, userId));
}

export function updateMemberRole(orgId: string, userId: string, role: Role): OrgMember | undefined {
  const existing = getMember(orgId, userId);
  if (!existing) return undefined;
  const updated: OrgMember = { ...existing, role };
  members.set(memberKey(orgId, userId), updated);
  return updated;
}

export function countAdmins(orgId: string): number {
  return listMembers(orgId).filter((m) => m.role === "admin").length;
}

export function createSession(userId: string, ttlMs: number): Session {
  const now = Date.now();
  const session: Session = { token: randomUUID() + randomUUID(), userId, createdAt: now, expiresAt: now + ttlMs };
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

// Test-only helper: reset all in-memory state between test files/cases.
export function __resetDbForTests(): void {
  orgs.clear();
  users.clear();
  usersByEmail.clear();
  members.clear();
  sessions.clear();
}
