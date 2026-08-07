import test from "node:test";
import assert from "node:assert/strict";
import { addAuditEvent, listAuditEvents } from "../src/persistence/db.ts";
import { resetAndSeed } from "./helpers.ts";

test("addAuditEvent records an event retrievable by org", () => {
  const { org, admin } = resetAndSeed();
  addAuditEvent({ orgId: org.id, actorUserId: admin.id, action: "test.action", target: "thing-1" });
  const events = listAuditEvents(org.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "test.action");
  assert.equal(events[0].orgId, org.id);
});

test("listAuditEvents does not leak events from another org", () => {
  const { org, otherOrg, admin } = resetAndSeed();
  addAuditEvent({ orgId: org.id, actorUserId: admin.id, action: "test.action" });
  const otherEvents = listAuditEvents(otherOrg.id);
  assert.equal(otherEvents.length, 0);
});
