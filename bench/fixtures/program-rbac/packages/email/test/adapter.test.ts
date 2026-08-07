import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail, getOutbox, findEmailsTo, __resetOutboxForTests } from "../src/adapter.ts";

test.beforeEach(() => {
  __resetOutboxForTests();
});

test("sendEmail captures the message in the outbox instead of sending it externally", async () => {
  await sendEmail({ to: "user@example.com", subject: "Hello", body: "World" });
  const outbox = getOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, "user@example.com");
  assert.equal(outbox[0].subject, "Hello");
});

test("findEmailsTo filters by recipient, case-insensitively", async () => {
  await sendEmail({ to: "A@Example.com", subject: "S1", body: "B1" });
  await sendEmail({ to: "other@example.com", subject: "S2", body: "B2" });
  const found = findEmailsTo("a@example.com");
  assert.equal(found.length, 1);
  assert.equal(found[0].subject, "S1");
});
