// DOC: Public entrypoint. Existing surface: POST /login, GET /me, POST
// /logout (session bearer auth). See PUBLIC_API.md for the full contract.
// Org-scoped API keys (create/list/revoke) are NOT implemented here yet —
// that is the feature this fixture exists to have added, following this
// same module layout (persistence/db.ts style store + auth/ helper +
// a route group here).
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { findUserByEmail, addAuditEvent } from "../persistence/db.ts";
import { verifySecret } from "../auth/hash.ts";
import { login, logout, authenticateSession, extractBearerToken } from "../auth/session.ts";

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
  const session = login(user.id, user.orgId);
  addAuditEvent({ orgId: user.orgId, actorUserId: user.id, action: "user.login", target: user.id });
  sendJson(res, 200, { token: session.token, expires_at: session.expiresAt });
}

async function handleMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const auth = authenticateSession(token);
  if (!auth) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  sendJson(res, 200, auth.user);
}

async function handleLogout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  const revoked = logout(token);
  if (!revoked) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  sendJson(res, 200, { status: "logged_out" });
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  if (method === "POST" && url === "/login") return handleLogin(req, res);
  if (method === "GET" && url === "/me") return handleMe(req, res);
  if (method === "POST" && url === "/logout") return handleLogout(req, res);

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
    console.log(`feature-api-keys fixture listening on :${port}`);
  });
}
