import test from "node:test";
import assert from "node:assert/strict";
import {
  createOrg,
  createUser,
  addMember,
  listMembers,
  removeMember,
  updateMemberRole,
  countAdmins,
  __resetDbForTests,
} from "../src/db.ts";

test.beforeEach(() => {
  __resetDbForTests();
});

test("addMember + listMembers roundtrips membership for an org", () => {
  const org = createOrg("Acme");
  const user = createUser({ email: "a@acme.test", passwordHash: "x" });
  addMember(org.id, user.id, "member");
  const members = listMembers(org.id);
  assert.equal(members.length, 1);
  assert.equal(members[0].userId, user.id);
  assert.equal(members[0].role, "member");
});

test("listMembers does not leak members from another org", () => {
  const orgA = createOrg("Acme");
  const orgB = createOrg("Globex");
  const user = createUser({ email: "a@acme.test", passwordHash: "x" });
  addMember(orgA.id, user.id, "admin");
  assert.equal(listMembers(orgB.id).length, 0);
});

test("updateMemberRole changes an existing member's role", () => {
  const org = createOrg("Acme");
  const user = createUser({ email: "a@acme.test", passwordHash: "x" });
  addMember(org.id, user.id, "member");
  const updated = updateMemberRole(org.id, user.id, "admin");
  assert.equal(updated?.role, "admin");
  assert.equal(countAdmins(org.id), 1);
});

test("removeMember removes membership", () => {
  const org = createOrg("Acme");
  const user = createUser({ email: "a@acme.test", passwordHash: "x" });
  addMember(org.id, user.id, "member");
  assert.equal(removeMember(org.id, user.id), true);
  assert.equal(listMembers(org.id).length, 0);
});
