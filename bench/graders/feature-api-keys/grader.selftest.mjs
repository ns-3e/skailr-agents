// DOC: planted-defect self-test (program AC-4). Builds a small synthetic
// workspace implementing the full feature-api-keys surface correctly except
// for ONE planted critical violation (revoked keys still authenticate),
// proving the grader flips solved=false on that single violation even
// though every other hidden check (including audit/cross-org/hash checks)
// passes — i.e. "visible-looking" quality stays high. A second, fully
// correct flavor proves a clean workspace yields zero critical failures.
// Lives under bench/graders/** (isolation invariant), never under fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRADE_ENTRY = path.join(__dirname, "grade.mjs");

const TYPES_TS = `
export type Role = "admin" | "member";
`;

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
const sessions = new Map();
const auditEvents = [];
const apiKeys = new Map();

export function createOrg(name) {
  const org = { id: randomUUID(), name };
  orgs.set(org.id, org);
  return org;
}
export function createUser(input) {
  const user = { id: randomUUID(), ...input };
  users.set(user.id, user);
  usersByEmail.set(user.email.toLowerCase(), user.id);
  return user;
}
export function getUser(id) { return users.get(id); }
export function findUserByEmail(email) {
  const id = usersByEmail.get(email.toLowerCase());
  return id ? users.get(id) : undefined;
}
export function createSession(userId, orgId, ttlMs) {
  const now = Date.now();
  const session = { token: randomUUID() + randomUUID(), userId, orgId, createdAt: now, expiresAt: now + ttlMs };
  sessions.set(session.token, session);
  return session;
}
export function getSession(token) {
  const s = sessions.get(token);
  if (!s) return undefined;
  if (s.expiresAt < Date.now()) { sessions.delete(token); return undefined; }
  return s;
}
export function revokeSession(token) { return sessions.delete(token); }
export function addAuditEvent(input) {
  const event = { id: randomUUID(), orgId: input.orgId, actorUserId: input.actorUserId, action: input.action, target: input.target ?? null, metadata: input.metadata ?? {}, createdAt: Date.now() };
  auditEvents.push(event);
  return event;
}
export function listAuditEvents(orgId) { return auditEvents.filter((e) => e.orgId === orgId); }

export function createApiKeyRecord({ orgId, name, hash }) {
  const rec = { id: randomUUID(), orgId, name, hash, revoked: false, createdAt: Date.now() };
  apiKeys.set(rec.id, rec);
  return rec;
}
export function listApiKeysByOrg(orgId) {
  return [...apiKeys.values()].filter((k) => k.orgId === orgId);
}
export function getApiKeyRecord(id) { return apiKeys.get(id); }
export function revokeApiKeyRecord(id) {
  const rec = apiKeys.get(id);
  if (!rec) return false;
  rec.revoked = true;
  return true;
}
export function allApiKeyRecords() { return [...apiKeys.values()]; }

export function __resetDbForTests() {
  orgs.clear(); users.clear(); usersByEmail.clear(); sessions.clear(); auditEvents.length = 0; apiKeys.clear();
}
`;
}

function serverTs({ plantRevokedBug }) {
  return `
import http from "node:http";
import {
  findUserByEmail, addAuditEvent, createSession, getSession, revokeSession, getUser,
  createApiKeyRecord, listApiKeysByOrg, getApiKeyRecord, revokeApiKeyRecord,
} from "../persistence/db.ts";
import { hashSecret, verifySecret } from "../auth/hash.ts";

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}
function extractBearer(header) {
  if (!header) return undefined;
  const m = /^Bearer\\s+(.+)$/.exec(header.trim());
  return m ? m[1] : undefined;
}
function findApiKeyForToken(token) {
  for (const rec of listAllKeysUnsafe()) {
    ${plantRevokedBug ? "" : "if (rec.revoked) continue;"}
    if (verifySecret(token, rec.hash)) return rec;
  }
  return undefined;
}
function listAllKeysUnsafe() {
  // reach across orgs deliberately here only for auth matching; org scoping
  // for data access is enforced separately below.
  return [...__allKeys()];
}
import { allApiKeyRecords as __allKeys } from "../persistence/db.ts";

async function authenticate(req) {
  const token = extractBearer(req.headers.authorization);
  if (!token) return null;
  const session = getSession(token);
  if (session) {
    const user = getUser(session.userId);
    if (user) return { orgId: session.orgId, userId: user.id, viaApiKey: false };
  }
  const keyRec = findApiKeyForToken(token);
  if (keyRec) return { orgId: keyRec.orgId, userId: null, viaApiKey: true, keyId: keyRec.id };
  return null;
}

async function handleLogin(req, res) {
  const raw = await readBody(req);
  const body = raw ? JSON.parse(raw) : {};
  const user = findUserByEmail(body.email || "");
  if (!user || !verifySecret(body.password, user.passwordHash)) return sendJson(res, 401, { error: "invalid_credentials" });
  const session = createSession(user.id, user.orgId, 24 * 3600 * 1000);
  addAuditEvent({ orgId: user.orgId, actorUserId: user.id, action: "user.login", target: user.id });
  sendJson(res, 200, { token: session.token, expires_at: session.expiresAt });
}
async function handleMe(req, res) {
  const auth = await authenticate(req);
  if (!auth || !auth.userId) return sendJson(res, 401, { error: "unauthorized" });
  const user = getUser(auth.userId);
  sendJson(res, 200, { id: user.id, orgId: user.orgId, email: user.email, role: user.role });
}
async function handleLogout(req, res) {
  const token = extractBearer(req.headers.authorization);
  if (!token || !revokeSession(token)) return sendJson(res, 401, { error: "unauthorized" });
  sendJson(res, 200, { status: "logged_out" });
}
async function handleCreateKey(req, res, auth) {
  const raw = await readBody(req);
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res, 400, { error: "invalid_json" }); }
  if (!body || typeof body.name !== "string" || body.name.length === 0) return sendJson(res, 400, { error: "invalid_request" });
  const rawKey = "sk_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const rec = createApiKeyRecord({ orgId: auth.orgId, name: body.name, hash: hashSecret(rawKey) });
  addAuditEvent({ orgId: auth.orgId, actorUserId: auth.userId || "api-key", action: "api_key.created", target: rec.id });
  sendJson(res, 201, { id: rec.id, name: rec.name, key: rawKey, createdAt: rec.createdAt });
}
async function handleListKeys(req, res, auth) {
  const records = listApiKeysByOrg(auth.orgId);
  sendJson(res, 200, records.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, revoked: r.revoked })));
}
async function handleGetKey(req, res, auth, id) {
  const rec = getApiKeyRecord(id);
  if (!rec || rec.orgId !== auth.orgId) return sendJson(res, 404, { error: "not_found" });
  sendJson(res, 200, { id: rec.id, name: rec.name, createdAt: rec.createdAt, revoked: rec.revoked });
}
async function handleRevokeKey(req, res, auth, id) {
  const rec = getApiKeyRecord(id);
  if (!rec || rec.orgId !== auth.orgId) return sendJson(res, 404, { error: "not_found" });
  revokeApiKeyRecord(id);
  addAuditEvent({ orgId: auth.orgId, actorUserId: auth.userId || "api-key", action: "api_key.revoked", target: id });
  sendJson(res, 200, { id, revoked: true });
}

export async function handleRequest(req, res) {
  const method = req.method || "GET";
  const url = req.url || "/";
  if (method === "POST" && url === "/login") return handleLogin(req, res);
  if (method === "GET" && url === "/me") return handleMe(req, res);
  if (method === "POST" && url === "/logout") return handleLogout(req, res);

  if (url === "/api-keys" || url.startsWith("/api-keys/")) {
    const auth = await authenticate(req);
    if (!auth) return sendJson(res, 401, { error: "unauthorized" });
    const rest = url.slice("/api-keys".length);
    if (method === "POST" && rest === "") return handleCreateKey(req, res, auth);
    if (method === "GET" && rest === "") return handleListKeys(req, res, auth);
    const idMatch = /^\\/([^/]+)$/.exec(rest);
    const revokeMatch = /^\\/([^/]+)\\/revoke$/.exec(rest);
    if (method === "GET" && idMatch) return handleGetKey(req, res, auth, idMatch[1]);
    if ((method === "DELETE" && idMatch) || (method === "POST" && revokeMatch)) {
      const id = idMatch ? idMatch[1] : revokeMatch[1];
      return handleRevokeKey(req, res, auth, id);
    }
  }
  sendJson(res, 404, { error: "not_found" });
}
export function createServer() {
  return http.createServer((req, res) => { handleRequest(req, res).catch(() => sendJson(res, 500, { error: "internal_error" })); });
}
`;
}

function makeWorkspace(flavor) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `api-keys-selftest-${flavor}-`));
  fs.mkdirSync(path.join(dir, "src", "persistence"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "http"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "types.ts"), TYPES_TS);
  fs.writeFileSync(path.join(dir, "src", "persistence", "db.ts"), dbTs());
  fs.writeFileSync(path.join(dir, "src", "auth", "hash.ts"), HASH_TS);
  // grader expects db.ts / hash.ts / server.ts at these exact relative paths
  fs.writeFileSync(path.join(dir, "src", "http", "server.ts"), serverTs({ plantRevokedBug: flavor === "buggy" }));
  return dir;
}

function runGraderCli(workspaceDir) {
  const res = spawnSync(process.execPath, [GRADE_ENTRY, workspaceDir], { cwd: __dirname, encoding: "utf8", timeout: 60000 });
  assert.equal(res.status, 0, `grader exited nonzero: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

test("AC-4: workspace with a planted revoked-key-still-authenticates bug flips solved=false on exactly that critical requirement", () => {
  const dir = makeWorkspace("buggy");
  try {
    const result = runGraderCli(dir);
    assert.equal(result.workspace_frozen, true);
    assert.equal(result.solved, false, "planted-bug workspace must not be solved");
    assert.ok(result.critical_failures.includes("revoked-keys-rejected"), `expected revoked-keys-rejected, got ${JSON.stringify(result.critical_failures)}`);
    // The other three critical requirements are correctly implemented in
    // this synthetic app and must NOT be flagged — proves the grader
    // isolates the one planted violation rather than failing everything.
    assert.ok(!result.critical_failures.includes("no-cross-org-access"), JSON.stringify(result.critical_failures));
    assert.ok(!result.critical_failures.includes("no-raw-key-storage"), JSON.stringify(result.critical_failures));
    assert.ok(!result.critical_failures.includes("hash-not-exposed"), JSON.stringify(result.critical_failures));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
    else console.error("kept:", dir);
  }
});
