// DOC: Existing UI component (no browser/bundler needed for this fixture —
// components are pure render-to-string functions, testable under node:test).
// Pattern to follow when adding the invitations UI: a view-model type +
// a pure render function, composed into apps/web/src/pages/OrganizationSettingsPage.ts.
import type { PublicMember } from "../../../../packages/contracts/src/types.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMembersList(members: PublicMember[]): string {
  if (members.length === 0) {
    return "<p>No members yet.</p>";
  }
  const rows = members
    .map((m) => `<tr><td>${escapeHtml(m.email)}</td><td>${escapeHtml(m.role)}</td></tr>`)
    .join("");
  return `<table class="members-list"><thead><tr><th>Email</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table>`;
}
