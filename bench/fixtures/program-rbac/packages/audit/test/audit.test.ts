import test from "node:test";
import assert from "node:assert/strict";
import { logEvent, listEvents, __resetAuditForTests } from "../src/audit.ts";

test.beforeEach(() => {
  __resetAuditForTests();
});

test("logEvent records an event retrievable by org", () => {
  logEvent({ orgId: "org1", actorUserId: "user1", action: "test.action", target: "thing-1" });
  const events = listEvents("org1");
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "test.action");
});

test("listEvents does not leak events from another org", () => {
  logEvent({ orgId: "org1", actorUserId: "user1", action: "test.action" });
  assert.equal(listEvents("org2").length, 0);
});
