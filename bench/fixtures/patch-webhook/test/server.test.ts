import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/server.ts";
import { __resetLedgerForTests } from "../src/ledger.ts";

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  __resetLedgerForTests();
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("POST /webhooks with a new event returns 200 and status processed", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_id: "e1", amount: 5, currency: "USD" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "processed");
    assert.equal(body.event_id, "e1");
  });
});

test("POST /webhooks with a missing event_id returns 400", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 5, currency: "USD" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /webhooks with malformed JSON returns 400", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
  });
});

test("GET on an unknown route returns 404", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/unknown`);
    assert.equal(res.status, 404);
  });
});

test("sequential repeat submission via HTTP returns duplicate status with original result", async () => {
  await withServer(async (base) => {
    const first = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_id: "e2", amount: 7, currency: "USD" }),
    });
    const firstBody = await first.json();
    const second = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event_id: "e2", amount: 999, currency: "USD" }),
    });
    const secondBody = await second.json();
    assert.equal(second.status, 200);
    assert.equal(secondBody.status, "duplicate");
    assert.equal(secondBody.result.amount, firstBody.result.amount);
  });
});
