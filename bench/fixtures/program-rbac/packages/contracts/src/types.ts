// Shared domain types imported (by relative path — this is a path-based
// monorepo, not npm workspaces) across apps/api, apps/web, and the other
// packages/. Extend this file when adding new persisted entities (e.g.
// invitations) rather than redefining shapes locally.

export type Role = "admin" | "member";

export interface Org {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

// Org membership — a user's role within one specific org. A user may belong
// to more than one org with a different role in each.
export interface OrgMember {
  orgId: string;
  userId: string;
  role: Role;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface PublicUser {
  id: string;
  email: string;
}

export interface PublicMember {
  userId: string;
  email: string;
  role: Role;
}
