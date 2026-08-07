import test from "node:test";
import assert from "node:assert/strict";
import { renderMembersList } from "../src/components/MembersList.ts";
import { renderOrganizationSettingsPage } from "../src/pages/OrganizationSettingsPage.ts";

test("renderMembersList renders an empty state with no members", () => {
  const html = renderMembersList([]);
  assert.match(html, /No members yet/);
});

test("renderMembersList renders a row per member and escapes HTML", () => {
  const html = renderMembersList([{ userId: "u1", email: "<script>@x.com", role: "admin" }]);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /admin/);
});

test("renderOrganizationSettingsPage composes the members section", () => {
  const html = renderOrganizationSettingsPage({
    orgName: "Acme",
    members: [{ userId: "u1", email: "a@acme.test", role: "admin" }],
  });
  assert.match(html, /Acme — Settings/);
  assert.match(html, /a@acme\.test/);
});
