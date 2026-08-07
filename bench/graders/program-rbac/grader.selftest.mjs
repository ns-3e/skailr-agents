// DOC: planted-defect self-test (program AC-4). Builds a small synthetic
// workspace implementing the full program-rbac surface correctly except for
// ONE planted critical violation (last-admin self-demote is allowed),
// proving the grader flips solved=false on exactly that violation while
// every other critical/hidden check (cross-org isolation, single-use,
// audit) passes. A second, fully correct flavor proves a clean workspace
// yields zero critical failures. Lives under bench/graders/** (isolation
// invariant), never under fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRADE_ENTRY = path.join(__dirname, "grade.mjs");

const HASH_TS = `
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const KEY_LEN = 32;
export function hashSecret(secret) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, KEY_LEN).toString("hex");
  return \`\${salt}:\${derived}\`;
}
export function verifySecret(secret, stored) {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  const derived = scryptSync(secret, salt, KEY_LEN);
  const expected = Buffer.from(derivedHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
`;

function dbTs() {
  return `
import { randomUUID } from "node:crypto";
const orgs = new Map();
const users = new Map();
const usersByEmail = new Map();
const members = new Map();
const sessions = new Map();
const key = (o, u) => \`\${o}:\${u}\`;
export function createOrg(name) { const org = { id: randomUUID(), name }; orgs.set(org.id, org); return org; }
export function createUser(input) { const u = { id: randomUUID(), ...input }; users.set(u.id, u); usersByEmail.set(u.email.toLowerCase(), u.id); return u; }
export function getUser(id) { return users.get(id); }
export function findUserByEmail(email) { const id = usersByEmail.get(email.toLowerCase()); return id ? users.get(id) : undefined; }
export function addMember(orgId, userId, role) { const m = { orgId, userId, role }; members.set(key(orgId, userId), m); return m; }
export function getMember(orgId, userId) { return members.get(key(orgId, userId)); }
export function listMembers(orgId) { return [...members.values()].filter((m) => m.orgId === orgId); }
export function removeMember(orgId, userId) { return members.delete(key(orgId, userId)); }
export function updateMemberRole(orgId, userId, role) { const e = getMember(orgId, userId); if (!e) return undefined; const u = { ...e, role }; members.set(key(orgId, userId), u); return u; }
export function countAdmins(orgId) { return listMembers(orgId).filter((m) => m.role === "admin").length; }
export function createSession(userId, ttlMs) { const now = Date.now(); const s = { token: randomUUID() + randomUUID(), userId, createdAt: now, expiresAt: now + ttlMs }; sessions.set(s.token, s); return s; }
export function getSession(token) { const s = sessions.get(token); if (!s) return undefined; if (s.expiresAt < Date.now()) { sessions.delete(token); return undefined; } return s; }
export function revokeSession(token) { return sessions.delete(token); }
export function __resetDbForTests() { orgs.clear(); users.clear(); usersByEmail.clear(); members.clear(); sessions.clear(); }
`;
}

const AUDIT_TS = `
import { randomUUID } from "node:crypto";
const events = [];
export function logEvent(input) {
  const e = { id: randomUUID(), orgId: input.orgId, actorUserId: input.actorUserId, action: input.action, target: input.target ?? null, metadata: input.metadata ?? {}, createdAt: Date.now() };
  events.push(e);
  return e;
}
export function listEvents(orgId) { return events.filter((e) => e.orgId === orgId); }
export function __resetAuditForTests() { events.length = 0; }
`;

const EMAIL_TS = `
const outbox = [];
export async function sendEmail(input) { const m = { ...input, sentAt: Date.now() }; outbox.push(m); return m; }
export function getOutbox() { return outbox; }
export function findEmailsTo(to) { return outbox.filter((m) => m.to.toLowerCase() === to.toLowerCase()); }
export function __resetOutboxForTests() { outbox.length = 0; }
`;

function serverTs({ plantLastAdminBug }) {
  return `
import http from "node:http";
import { findUserByEmail, getMember, listMembers, getUser, createUser, addMember, removeMember, updateMemberRole, countAdmins } from "../../../packages/db/src/db.ts";
import { verifySecret } from "./auth/hash.ts";
import { login, logout, authenticateSession, extractBearerToken } from "./auth/session.ts";
import { logEvent } from "../../../packages/audit/src/audit.ts";
import { sendEmail } from "../../../packages/email/src/adapter.ts";
import { randomUUID } from "node:crypto";

const invitations = new Map(); // id -> { id, orgId, email, role, status, token }

function sendJson(res, status, body) { const p = JSON.stringify(body); res.writeHead(status, { "Content-Type": "application/json" }); res.end(p); }
function readBody(req) { return new Promise((resolve) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); }); }
async function parseBody(req) { const raw = await readBody(req); if (!raw) return {}; try { return JSON.parse(raw); } catch { return null; } }

async function handleLogin(req, res) {
  const body = await parseBody(req);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") return sendJson(res, 400, { error: "invalid_request" });
  const user = findUserByEmail(body.email);
  if (!user || !verifySecret(body.password, user.passwordHash)) return sendJson(res, 401, { error: "invalid_credentials" });
  const { token, expiresAt } = login(user.id);
  sendJson(res, 200, { token, expires_at: expiresAt });
}
async function handleMe(req, res) {
  const user = authenticateSession(extractBearerToken(req.headers.authorization));
  if (!user) return sendJson(res, 401, { error: "unauthorized" });
  sendJson(res, 200, user);
}
async function handleLogout(req, res) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token || !logout(token)) return sendJson(res, 401, { error: "unauthorized" });
  sendJson(res, 200, { status: "logged_out" });
}
function resolveMemberEmails(orgId) { return listMembers(orgId).map((m) => { const u = getUser(m.userId); return { userId: m.userId, email: u ? u.email : "", role: m.role }; }); }
async function handleListMembers(req, res, orgId) {
  const user = authenticateSession(extractBearerToken(req.headers.authorization));
  if (!user) return sendJson(res, 401, { error: "unauthorized" });
  const m = getMember(orgId, user.id);
  if (!m) return sendJson(res, 403, { error: "forbidden" });
  sendJson(res, 200, { members: resolveMemberEmails(orgId) });
}
function requireAdmin(orgId, userId) {
  const m = getMember(orgId, userId);
  return !!m && m.role === "admin";
}
async function handleCreateInvite(req, res, orgId, actor) {
  if (!requireAdmin(orgId, actor.id)) return sendJson(res, 403, { error: "forbidden" });
  const body = await parseBody(req);
  if (!body || typeof body.email !== "string" || (body.role !== "admin" && body.role !== "member")) return sendJson(res, 400, { error: "invalid_request" });
  const inv = { id: randomUUID(), orgId, email: body.email, role: body.role, status: "pending", token: randomUUID() };
  invitations.set(inv.id, inv);
  logEvent({ orgId, actorUserId: actor.id, action: "invitation.created", target: inv.id, metadata: { email: inv.email } });
  await sendEmail({ to: inv.email, subject: "You are invited", body: \`Join using token \${inv.token}\` });
  sendJson(res, 201, { id: inv.id, email: inv.email, role: inv.role, status: inv.status, token: inv.token });
}
async function handleListInvites(req, res, orgId, actor) {
  if (!requireAdmin(orgId, actor.id)) return sendJson(res, 403, { error: "forbidden" });
  const list = [...invitations.values()].filter((i) => i.orgId === orgId && i.status === "pending");
  sendJson(res, 200, { invitations: list.map((i) => ({ id: i.id, email: i.email, role: i.role, status: i.status })) });
}
async function handleGetInvite(req, res, orgId, actor, id) {
  if (!requireAdmin(orgId, actor.id)) return sendJson(res, 403, { error: "forbidden" });
  const inv = invitations.get(id);
  if (!inv || inv.orgId !== orgId) return sendJson(res, 404, { error: "not_found" });
  sendJson(res, 200, { id: inv.id, email: inv.email, role: inv.role, status: inv.status });
}
async function handleRevokeInvite(req, res, orgId, actor, id) {
  if (!requireAdmin(orgId, actor.id)) return sendJson(res, 403, { error: "forbidden" });
  const inv = invitations.get(id);
  if (!inv || inv.orgId !== orgId) return sendJson(res, 404, { error: "not_found" });
  inv.status = "revoked";
  sendJson(res, 200, { id: inv.id, status: "revoked" });
}
async function handleAccept(req, res) {
  const body = await parseBody(req);
  const token = body && body.token;
  const inv = token ? [...invitations.values()].find((i) => i.token === token) : undefined;
  if (!inv || inv.status !== "pending") return sendJson(res, 400, { error: "invalid_invitation" });
  let user = findUserByEmail(inv.email);
  if (!user) user = createUser({ email: inv.email, passwordHash: "unset:unset" });
  addMember(inv.orgId, user.id, inv.role);
  inv.status = "accepted";
  logEvent({ orgId: inv.orgId, actorUserId: user.id, action: "invitation.accepted", target: inv.id });
  sendJson(res, 200, { orgId: inv.orgId, userId: user.id, role: inv.role });
}
async function handleRoleChange(req, res, orgId, actor, userId) {
  if (!requireAdmin(orgId, actor.id)) return sendJson(res, 403, { error: "forbidden" });
  const body = await parseBody(req);
  const role = body && body.role;
  if (role !== "admin" && role !== "member") return sendJson(res, 400, { error: "invalid_request" });
  const target = getMember(orgId, userId);
  if (!target) return sendJson(res, 404, { error: "not_found" });
  ${plantLastAdminBug ? "" : "if (target.role === \"admin\" && role === \"member\" && countAdmins(orgId) <= 1) return sendJson(res, 409, { error: \"last_admin\" });"}
  updateMemberRole(orgId, userId, role);
  logEvent({ orgId, actorUserId: actor.id, action: "member.role_changed", target: userId, metadata: { role } });
  sendJson(res, 200, { orgId, userId, role });
}
async function handleRemoveMember(req, res, orgId, actor, userId) {
  if (!requireAdmin(orgId, actor.id)) return sendJson(res, 403, { error: "forbidden" });
  const target = getMember(orgId, userId);
  if (!target) return sendJson(res, 404, { error: "not_found" });
  if (target.role === "admin" && countAdmins(orgId) <= 1) return sendJson(res, 409, { error: "last_admin" });
  removeMember(orgId, userId);
  logEvent({ orgId, actorUserId: actor.id, action: "member.removed", target: userId });
  sendJson(res, 200, { orgId, userId, removed: true });
}

const MEMBERS_ROUTE = /^\\/orgs\\/([^/]+)\\/members$/;
const MEMBER_ITEM_ROUTE = /^\\/orgs\\/([^/]+)\\/members\\/([^/]+)$/;
const INVITES_ROUTE = /^\\/orgs\\/([^/]+)\\/invitations$/;
const INVITE_ITEM_ROUTE = /^\\/orgs\\/([^/]+)\\/invitations\\/([^/]+)$/;

export async function handleRequest(req, res) {
  const method = req.method || "GET";
  const url = req.url || "/";
  if (method === "POST" && url === "/login") return handleLogin(req, res);
  if (method === "GET" && url === "/me") return handleMe(req, res);
  if (method === "POST" && url === "/logout") return handleLogout(req, res);
  if (method === "POST" && url === "/invitations/accept") return handleAccept(req, res);

  let m = MEMBERS_ROUTE.exec(url);
  if (method === "GET" && m) return handleListMembers(req, res, m[1]);

  m = MEMBER_ITEM_ROUTE.exec(url);
  if (m) {
    const auth = authenticateSession(extractBearerToken(req.headers.authorization));
    if (!auth) return sendJson(res, 401, { error: "unauthorized" });
    if (method === "PATCH") return handleRoleChange(req, res, m[1], auth, m[2]);
    if (method === "DELETE") return handleRemoveMember(req, res, m[1], auth, m[2]);
  }

  m = INVITES_ROUTE.exec(url);
  if (m) {
    const auth = authenticateSession(extractBearerToken(req.headers.authorization));
    if (!auth) return sendJson(res, 401, { error: "unauthorized" });
    if (method === "POST") return handleCreateInvite(req, res, m[1], auth);
    if (method === "GET") return handleListInvites(req, res, m[1], auth);
  }

  m = INVITE_ITEM_ROUTE.exec(url);
  if (m) {
    const auth = authenticateSession(extractBearerToken(req.headers.authorization));
    if (!auth) return sendJson(res, 401, { error: "unauthorized" });
    if (method === "GET") return handleGetInvite(req, res, m[1], auth, m[2]);
    if (method === "DELETE") return handleRevokeInvite(req, res, m[1], auth, m[2]);
  }

  sendJson(res, 404, { error: "not_found" });
}
export function createServer() { return http.createServer((req, res) => { handleRequest(req, res).catch((e) => sendJson(res, 500, { error: "internal_error" })); }); }
`;
}

function makeWorkspace(flavor) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `program-rbac-selftest-${flavor}-`));
  fs.mkdirSync(path.join(dir, "apps", "api", "src", "auth"), { recursive: true });
  fs.mkdirSync(path.join(dir, "apps", "web", "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "packages", "db", "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "packages", "audit", "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "packages", "email", "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "packages", "db", "src", "db.ts"), dbTs());
  fs.writeFileSync(path.join(dir, "packages", "audit", "src", "audit.ts"), AUDIT_TS);
  fs.writeFileSync(path.join(dir, "packages", "email", "src", "adapter.ts"), EMAIL_TS);
  fs.writeFileSync(path.join(dir, "apps", "api", "src", "auth", "hash.ts"), HASH_TS);
  fs.writeFileSync(
    path.join(dir, "apps", "api", "src", "auth", "session.ts"),
    `
import { createSession, getSession, revokeSession, getUser } from "../../../../packages/db/src/db.ts";
export function login(userId) { const s = createSession(userId, 24*3600*1000); return { token: s.token, expiresAt: s.expiresAt }; }
export function logout(token) { return revokeSession(token); }
export function authenticateSession(token) { if (!token) return null; const s = getSession(token); if (!s) return null; const u = getUser(s.userId); if (!u) return null; return { id: u.id, email: u.email }; }
export function extractBearerToken(h) { if (!h) return undefined; const m = /^Bearer\\s+(.+)$/.exec(h.trim()); return m ? m[1] : undefined; }
`
  );
  fs.writeFileSync(path.join(dir, "apps", "api", "src", "server.ts"), serverTs({ plantLastAdminBug: flavor === "buggy" }));
  // minimal UI presence signal for the non-critical hidden check
  fs.writeFileSync(path.join(dir, "apps", "web", "src", "InvitationsPanel.ts"), "// renders pending invitations for the org settings page\nexport function renderInvitations(list) { return list.map((i) => i.email).join(','); }\n");
  return dir;
}

function runGraderCli(workspaceDir) {
  const res = spawnSync(process.execPath, [GRADE_ENTRY, workspaceDir], { cwd: __dirname, encoding: "utf8", timeout: 60000 });
  assert.equal(res.status, 0, `grader exited nonzero: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

test("AC-4: workspace with a planted last-admin-self-demote bug flips solved=false on exactly that critical requirement", () => {
  const dir = makeWorkspace("buggy");
  try {
    const result = runGraderCli(dir);
    assert.equal(result.workspace_frozen, true);
    assert.equal(result.solved, false, JSON.stringify(result.tests.hidden_functional.cases));
    assert.ok(result.critical_failures.includes("last-admin-protected"), JSON.stringify(result.critical_failures));
    assert.ok(!result.critical_failures.includes("cross-org-isolation"), JSON.stringify(result.critical_failures));
    assert.ok(!result.critical_failures.includes("invitation-single-use"), JSON.stringify(result.critical_failures));
    assert.ok(!result.critical_failures.includes("audit-events-emitted"), JSON.stringify(result.critical_failures));
  } finally {
    if (!process.env.KEEP_SELFTEST_DIR) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-4: fully correct synthetic workspace yields zero critical failures and solved=true", () => {
  const dir = makeWorkspace("clean");
  try {
    const result = runGraderCli(dir);
    assert.equal(result.workspace_frozen, true);
    assert.deepEqual(result.critical_failures, []);
    assert.equal(result.solved, true, JSON.stringify(result.tests.hidden_functional.cases));
  } finally {
    if (!process.env.KEEP_SELFTEST_DIR) fs.rmSync(dir, { recursive: true, force: true });
  }
});
