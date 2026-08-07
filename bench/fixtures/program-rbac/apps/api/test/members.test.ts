import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/server.ts";
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

async function loginAs(base: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return body.token;
}

test("GET /orgs/:orgId/members returns members for a requester who belongs to that org", async () => {
  const { org } = resetAndSeed();
  await withServer(async (base) => {
    const token = await loginAs(base, "admin@acme.test", "correct horse battery staple");
    const res = await fetch(`${base}/orgs/${org.id}/members`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.members.length, 2);
  });
});

test("GET /orgs/:orgId/members returns 403 for a requester who is not a member of that org", async () => {
  const { org } = resetAndSeed();
  await withServer(async (base) => {
    const outsiderToken = await loginAs(base, "outsider@globex.test", "outsider-pass-1");
    const res = await fetch(`${base}/orgs/${org.id}/members`, { headers: { authorization: `Bearer ${outsiderToken}` } });
    assert.equal(res.status, 403);
  });
});

test("GET /orgs/:orgId/members returns 401 without a session token", async () => {
  const { org } = resetAndSeed();
  await withServer(async (base) => {
    const res = await fetch(`${base}/orgs/${org.id}/members`);
    assert.equal(res.status, 401);
  });
});
