// DOC: Public entrypoint. Existing surface: POST /login, GET /me,
// GET /orgs/:orgId/members (session bearer auth). See PUBLIC_API.md for the
// full contract. Team invitations (create/list/revoke/accept) and
// role-based access control (admin-only management, last-admin protection)
// are NOT implemented here yet — that is the feature this fixture exists to
// have added, exposed through this same API and mounted under
// apps/web's organization settings area.
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { findUserByEmail, getMember, listMembers, getUser } from "../../../packages/db/src/db.ts";
import { verifySecret } from "./auth/hash.ts";
import { login, logout, authenticateSession, extractBearerToken } from "./auth/session.ts";
import type { PublicMember } from "../../../packages/contracts/src/types.ts";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const raw = await readBody(req);
  if (raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    sendJson(res, 400, { error: "invalid_request", detail: "email and password are required" });
    return;
  }
  const user = findUserByEmail(body.email);
  if (!user || !verifySecret(body.password, user.passwordHash)) {
    sendJson(res, 401, { error: "invalid_credentials" });
    return;
  }
  const { token, expiresAt } = login(user.id);
  sendJson(res, 200, { token, expires_at: expiresAt });
}

async function handleMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const user = authenticateSession(token);
  if (!user) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  sendJson(res, 200, user);
}

async function handleLogout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token || !logout(token)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  sendJson(res, 200, { status: "logged_out" });
}

function resolveMemberEmails(orgId: string): PublicMember[] {
  return listMembers(orgId).map((m) => {
    const u = getUser(m.userId);
    return { userId: m.userId, email: u ? u.email : "", role: m.role };
  });
}

async function handleListMembers(req: IncomingMessage, res: ServerResponse, orgId: string): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const user = authenticateSession(token);
  if (!user) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  const requesterMembership = getMember(orgId, user.id);
  if (!requesterMembership) {
    // Not a member of this org: existing baseline org-scoping. Do not leak
    // membership data to non-members of the org.
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  sendJson(res, 200, { members: resolveMemberEmails(orgId) });
}

const MEMBERS_ROUTE = /^\/orgs\/([^/]+)\/members$/;

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  if (method === "POST" && url === "/login") return handleLogin(req, res);
  if (method === "GET" && url === "/me") return handleMe(req, res);
  if (method === "POST" && url === "/logout") return handleLogout(req, res);

  const membersMatch = MEMBERS_ROUTE.exec(url);
  if (method === "GET" && membersMatch) return handleListMembers(req, res, membersMatch[1]);

  sendJson(res, 404, { error: "not_found" });
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "internal_error" });
    });
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("server.ts");
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`program-rbac fixture listening on :${port}`);
  });
}
