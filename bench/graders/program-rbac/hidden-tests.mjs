// DOC: hidden black-box(ish) test suite for program-rbac. Talks to the
// workspace's HTTP surface over loopback (server hosted in-process via the
// declared "api" entrypoint). Setup/verification uses ONLY pre-existing,
// stable accessors from db/audit/email packages (never an agent-defined
// invitation accessor by guessed name) — mirrors the lesson learned in the
// feature-api-keys grader: never call agent-authored functions blindly, it
// can mutate state unpredictably. New-feature behavior is exercised
// strictly over HTTP.
import fs from "node:fs";
import path from "node:path";
import {
  discoverInviteCreate,
  list,
  getById,
  discoverRevoke,
  discoverAccept,
  discoverRoleChange,
  discoverMemberRemove,
  req,
} from "./lib/probe.mjs";

function pushCase(cases, id, ok, detail) {
  cases.push({ id, ok, detail: detail !== undefined ? String(detail).slice(0, 800) : undefined });
}

// DOC: fallback token discovery. Some implementations legitimately never
// return the raw invitation token in the create-invitation HTTP response
// (only via the mocked email) — a reasonable security choice, not a bug.
// Tries conventional accept-link/token shapes against the email's subject
// and body text.
function extractInviteTokenFromEmail(message) {
  if (!message) return undefined;
  const text = `${message.subject || ""}\n${message.body || ""}`;
  const patterns = [
    /token=([A-Za-z0-9._-]{8,})/, // ?token=<value> query param
    /\/invitations?\/([A-Za-z0-9._-]{8,})\/accept/, // /invitations/<value>/accept
    /\/accept-invitation\/([A-Za-z0-9._-]{8,})/, // /accept-invitation/<value>
    /\btoken\b\s*[:=]\s*["']?([A-Za-z0-9._-]{8,})["']?/i, // "token: <value>" / "token=<value>" prose
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    // Trim trailing sentence punctuation a greedy match can pick up when the
    // token sits at the end of a prose sentence (the charset above allows
    // "." to support dotted token formats like JWTs, so a token immediately
    // followed by ". " would otherwise swallow the full stop).
    if (m) return m[1].replace(/[.,;:!?]+$/, "");
  }
  return undefined;
}

export async function runHiddenTests(base, { db, audit, email, workspaceDir, seeded }) {
  const hf = [];
  const reg = [];
  const sec = [];
  const critical = {
    "cross-org-isolation": null,
    "last-admin-protected": null,
    "invitation-single-use": null,
    "audit-events-emitted": null,
  };

  async function login(email_, password) {
    const r = await req(base, "POST", "/login", { body: { email: email_, password } });
    return r.json?.token;
  }
  const sessAdminA = await login(seeded.adminA.email, seeded.adminA.password);
  const sessMemberA = await login(seeded.memberA.email, seeded.memberA.password);
  const sessAdminB = await login(seeded.adminB.email, seeded.adminB.password);
  // The invitee already has an account (seeded, not yet a member of any
  // org) so accept can be exercised as an authenticated request — matching
  // every other mutating endpoint this fixture ships. See discoverAccept
  // below: without this session, implementations that reasonably gate
  // accept behind auth are structurally unreachable by this probe.
  const sessInvitee = await login(seeded.invitee.email, seeded.invitee.password);
  pushCase(reg, "reg-existing-login-still-works", !!sessAdminA && !!sessMemberA && !!sessAdminB, "seeded users authenticate via unchanged /login");

  // --- regression: existing members endpoint / org-scoping unaffected ---
  try {
    const okMembers = await req(base, "GET", `/orgs/${seeded.orgA.id}/members`, { token: sessAdminA });
    const forbidden = await req(base, "GET", `/orgs/${seeded.orgA.id}/members`, { token: sessAdminB });
    pushCase(
      reg,
      "reg-members-endpoint-org-scoping-unchanged",
      okMembers.status === 200 && forbidden.status === 403,
      `member-of=${okMembers.status} non-member=${forbidden.status}`
    );
  } catch (err) {
    pushCase(reg, "reg-members-endpoint-org-scoping-unchanged", false, String(err.message || err));
  }

  // --- invitation create (admin only) ---
  const inviteEmail = seeded.invitee.email;
  const discovered = sessAdminA
    ? await discoverInviteCreate(base, seeded.orgA.id, sessAdminA, { email: inviteEmail, role: "member" })
    : null;
  if (!discovered) {
    pushCase(hf, "hf-invitation-endpoint-discoverable", false, "no invitation create endpoint discovered (feature likely absent)");
    critical["cross-org-isolation"] = false;
    critical["last-admin-protected"] = false;
    critical["invitation-single-use"] = false;
    critical["audit-events-emitted"] = false;
    return finalize(hf, reg, sec, critical, { discovered: false });
  }
  pushCase(hf, "hf-invitation-endpoint-discoverable", true, `basePath=${discovered.basePath} id=${discovered.id}`);

  // --- member (non-admin) cannot create invitations ---
  try {
    const denied = await discoverInviteCreate(base, seeded.orgA.id, sessMemberA, { email: "other@bench.test", role: "member" });
    pushCase(sec, "sec-member-cannot-create-invitation", denied === null, denied ? `unexpectedly succeeded via ${denied.basePath}` : "denied");
  } catch (err) {
    pushCase(sec, "sec-member-cannot-create-invitation", false, String(err.message || err));
  }

  // --- pending invitations listed ---
  const listing = await list(base, discovered.basePath, sessAdminA);
  const listedIncludesInvite = JSON.stringify(listing.json || "").includes(discovered.id);
  pushCase(hf, "hf-pending-invitations-listed", listing.status === 200 && listedIncludesInvite, `status=${listing.status}`);

  // --- email sent via the existing mock adapter (stable read-only accessor) ---
  try {
    const emails = email.findEmailsTo(inviteEmail);
    pushCase(hf, "hf-invitation-email-sent-via-mock-adapter", emails.length > 0, `outbox matches=${emails.length}`);
    // Fall back to extracting the invite token from the emailed accept
    // link/body when the create-invitation HTTP response doesn't echo it.
    // A response that omits the raw token (only the id/email/role/status)
    // is a reasonable, security-conscious design — the token is a secret
    // that should reach only the invitee, via email, never the admin who
    // created the invite. discoverInviteCreate only reads the JSON
    // response body, so without this fallback `discovered.inviteToken` is
    // undefined and every accept candidate is built with the wrong value
    // (the invitation id) standing in for the token — guaranteed to fail
    // regardless of route shape or auth. See
    // docs/audits/2026-08-10-program-rbac-diagnosis.md.
    if (!discovered.inviteToken && emails.length > 0) {
      discovered.inviteToken = extractInviteTokenFromEmail(emails[emails.length - 1]);
    }
  } catch (err) {
    pushCase(hf, "hf-invitation-email-sent-via-mock-adapter", false, String(err.message || err));
  }

  // --- audit event on invitation creation (stable read-only accessor) ---
  try {
    const events = audit.listEvents(seeded.orgA.id);
    const created = events.some((e) => /invit/i.test(e.action || "") && /(creat|sent|invite)/i.test(e.action || ""));
    pushCase(hf, "hf-audit-event-on-invitation-create", created, `orgA audit actions=${JSON.stringify(events.map((e) => e.action))}`);
  } catch (err) {
    pushCase(hf, "hf-audit-event-on-invitation-create", false, String(err.message || err));
  }

  // --- cross-org isolation: org B admin must not see/revoke/fetch org A's invitation ---
  const crossList = await list(base, discovered.basePath, sessAdminB);
  const crossListLeaks = JSON.stringify(crossList.json || "").includes(discovered.id);
  const crossGet = await getById(base, discovered.basePath, discovered.id, sessAdminB);
  const crossGetDenied = crossGet.status === 403 || crossGet.status === 404;
  const crossRevoke = await discoverRevoke(base, discovered.basePath, discovered.id, sessAdminB);
  const crossRevokeDenied = crossRevoke === null || (crossRevoke.response.status >= 400 && crossRevoke.response.status < 500);
  const crossOrgIsolation = !crossListLeaks && crossGetDenied && crossRevokeDenied;
  pushCase(
    hf,
    "hf-cross-org-isolation-on-invitations",
    crossOrgIsolation,
    `listLeaks=${crossListLeaks} getDenied(${crossGet.status})=${crossGetDenied} revokeDenied=${crossRevokeDenied}`
  );
  critical["cross-org-isolation"] = crossOrgIsolation;

  // --- revoke a second invitation, then confirm accept fails on it ---
  const secondInvite = await discoverInviteCreate(base, seeded.orgA.id, sessAdminA, { email: "revoke-target@bench.test", role: "member" });
  let revokedOk = false;
  if (secondInvite) {
    const revoked = await discoverRevoke(base, discovered.basePath, secondInvite.id, sessAdminA);
    revokedOk = !!revoked;
    pushCase(hf, "hf-admin-can-revoke-invitation", revokedOk, revoked ? `${revoked.shape.method} ${revoked.shape.path} -> ${revoked.response.status}` : "no revoke shape succeeded");
    if (revokedOk) {
      const acceptAfterRevoke = await discoverAccept(base, seeded.orgA.id, discovered.basePath, secondInvite.id, secondInvite.inviteToken, undefined);
      pushCase(hf, "hf-revoked-invitation-cannot-be-accepted", acceptAfterRevoke === null, acceptAfterRevoke ? `unexpectedly accepted (${acceptAfterRevoke.response.status})` : "denied");
    }
  } else {
    pushCase(hf, "hf-admin-can-revoke-invitation", false, "second invitation creation failed");
  }

  // --- malformed / bogus invitation accept must not 500 or succeed ---
  try {
    const bogus = await discoverAccept(base, seeded.orgA.id, discovered.basePath, "not-a-real-id", "not-a-real-token", sessInvitee);
    pushCase(sec, "sec-malformed-invitation-accept-rejected", bogus === null, bogus ? "unexpectedly accepted" : "denied/not-found");
  } catch (err) {
    pushCase(sec, "sec-malformed-invitation-accept-rejected", false, String(err.message || err));
  }

  // --- accept lifecycle + single-use (critical) ---
  // Authenticated as the invitee: accept is a mutating, identity-sensitive
  // action (the response depends on which user is accepting), and every
  // other mutating endpoint in this fixture requires a session — an
  // unauthenticated probe here can never reach an implementation that
  // reasonably follows that same convention.
  const acceptResult = await discoverAccept(base, seeded.orgA.id, discovered.basePath, discovered.id, discovered.inviteToken, sessInvitee);
  if (!acceptResult) {
    pushCase(hf, "hf-invitation-accept-discoverable", false, "no accept shape succeeded for the original invitation");
    critical["invitation-single-use"] = false;
  } else {
    pushCase(hf, "hf-invitation-accept-discoverable", true, `${acceptResult.shape.method} ${acceptResult.shape.path} -> ${acceptResult.response.status}`);

    const membersAfter = await req(base, "GET", `/orgs/${seeded.orgA.id}/members`, { token: sessAdminA });
    const joinedCorrectOrg = JSON.stringify(membersAfter.json || "").includes(inviteEmail);
    pushCase(hf, "hf-accepted-invitation-joins-correct-org", joinedCorrectOrg, `members=${JSON.stringify(membersAfter.json)}`);

    try {
      const events = audit.listEvents(seeded.orgA.id);
      const accepted = events.some((e) => /invit/i.test(e.action || "") && /(accept|join)/i.test(e.action || ""));
      pushCase(hf, "hf-audit-event-on-invitation-accept", accepted, `orgA audit actions=${JSON.stringify(events.map((e) => e.action))}`);
    } catch (err) {
      pushCase(hf, "hf-audit-event-on-invitation-accept", false, String(err.message || err));
    }

    // reuse the SAME invitation a second time -> must be rejected
    const secondAttempt = await discoverAccept(base, seeded.orgA.id, discovered.basePath, discovered.id, discovered.inviteToken, sessInvitee);
    const singleUse = secondAttempt === null;
    pushCase(hf, "hf-invitation-single-use-enforced", singleUse, secondAttempt ? `unexpectedly accepted twice (${secondAttempt.response.status})` : "second accept denied");
    critical["invitation-single-use"] = singleUse;
  }

  // --- last-admin-protected: org A has exactly one admin (adminA) ---
  const selfDemote = await discoverRoleChange(base, seeded.orgA.id, seeded.adminA.id, "member", sessAdminA);
  const selfDemoteDenied = selfDemote === null || selfDemote.denied || (selfDemote.response.status >= 400 && selfDemote.response.status < 500);
  const selfRemove = await discoverMemberRemove(base, seeded.orgA.id, seeded.adminA.id, sessAdminA);
  const selfRemoveDenied = !selfRemove || (selfRemove.response.status >= 400 && selfRemove.response.status < 500);
  const lastAdminProtected = selfDemoteDenied && selfRemoveDenied;
  pushCase(
    hf,
    "hf-last-admin-cannot-demote-or-remove-self",
    lastAdminProtected,
    `selfDemoteDenied=${selfDemoteDenied}(${selfDemote?.response?.status}) selfRemoveDenied=${selfRemoveDenied}(${selfRemove?.response?.status})`
  );
  critical["last-admin-protected"] = lastAdminProtected;

  // --- audit-events-emitted (critical, overall signal) ---
  critical["audit-events-emitted"] =
    hf.some((c) => c.id === "hf-audit-event-on-invitation-create" && c.ok) &&
    hf.some((c) => c.id === "hf-audit-event-on-invitation-accept" && c.ok);

  // --- UI presence (file-presence heuristic; non-browser) ---
  try {
    const webDir = path.join(workspaceDir, "apps", "web", "src");
    let mentionsInvitation = false;
    if (fs.existsSync(webDir)) {
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.(ts|tsx)$/.test(e.name)) {
            const text = fs.readFileSync(full, "utf8");
            if (/invit/i.test(text)) mentionsInvitation = true;
          }
        }
      };
      walk(webDir);
    }
    pushCase(hf, "hf-invitations-ui-present-in-org-settings", mentionsInvitation, `apps/web/src scanned for "invit" references: ${mentionsInvitation}`);
  } catch (err) {
    pushCase(hf, "hf-invitations-ui-present-in-org-settings", false, String(err.message || err));
  }

  // --- security/edge ---
  try {
    const badRole = await req(base, "POST", discovered.basePath, { token: sessAdminA, body: { email: "bad-role@bench.test", role: "superuser" } });
    pushCase(sec, "sec-invalid-role-value-handled", badRole.status >= 400 && badRole.status < 500, `status=${badRole.status}`);
  } catch (err) {
    pushCase(sec, "sec-invalid-role-value-handled", false, String(err.message || err));
  }
  try {
    const noAuth = await list(base, discovered.basePath, undefined);
    pushCase(sec, "sec-list-requires-auth", noAuth.status === 401, `status=${noAuth.status}`);
  } catch (err) {
    pushCase(sec, "sec-list-requires-auth", false, String(err.message || err));
  }
  try {
    const missingEmail = await req(base, "POST", discovered.basePath, { token: sessAdminA, body: { role: "member" } });
    pushCase(sec, "sec-missing-email-handled", missingEmail.status >= 400 && missingEmail.status < 500, `status=${missingEmail.status}`);
  } catch (err) {
    pushCase(sec, "sec-missing-email-handled", false, String(err.message || err));
  }

  return finalize(hf, reg, sec, critical, { discovered: true });
}

function toCategory(cases) {
  return {
    passed: cases.filter((c) => c.ok).length,
    failed: cases.filter((c) => !c.ok).length,
    total: cases.length,
    cases: cases.map((c) => (c.detail === undefined ? { id: c.id, ok: c.ok } : c)),
  };
}
function finalize(hf, reg, sec, critical, meta) {
  return { hidden_functional: toCategory(hf), regression: toCategory(reg), security: toCategory(sec), criticalSignals: critical, meta };
}
