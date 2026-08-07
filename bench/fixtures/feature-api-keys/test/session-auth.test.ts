import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/http/server.ts";
import { resetAndSeed } from "./helpers.ts";

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("POST /login with valid credentials returns a session token", async () => {
  resetAndSeed();
  await withServer(async (base) => {
    const res = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test", password: "correct horse battery staple" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.token, "string");
    assert.ok(body.token.length > 0);
  });
});

test("POST /login with wrong password returns 401", async () => {
  resetAndSeed();
  await withServer(async (base) => {
    const res = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test", password: "wrong" }),
    });
    assert.equal(res.status, 401);
  });
});

test("GET /me with a valid session token returns the user profile, scoped to their org", async () => {
  const { org, admin } = resetAndSeed();
  await withServer(async (base) => {
    const loginRes = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test", password: "correct horse battery staple" }),
    });
    const { token } = await loginRes.json();

    const meRes = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(meRes.status, 200);
    const me = await meRes.json();
    assert.equal(me.id, admin.id);
    assert.equal(me.orgId, org.id);
    assert.equal(me.email, "admin@acme.test");
  });
});

test("GET /me with no token returns 401", async () => {
  resetAndSeed();
  await withServer(async (base) => {
    const res = await fetch(`${base}/me`);
    assert.equal(res.status, 401);
  });
});

test("GET /me with an invalid token returns 401", async () => {
  resetAndSeed();
  await withServer(async (base) => {
    const res = await fetch(`${base}/me`, { headers: { authorization: "Bearer not-a-real-token" } });
    assert.equal(res.status, 401);
  });
});

test("POST /logout revokes the session so it can no longer authenticate", async () => {
  resetAndSeed();
  await withServer(async (base) => {
    const loginRes = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test", password: "correct horse battery staple" }),
    });
    const { token } = await loginRes.json();

    const logoutRes = await fetch(`${base}/logout`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    assert.equal(logoutRes.status, 200);

    const meRes = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(meRes.status, 401);
  });
});
