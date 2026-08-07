// DOC: hidden black-box(ish) test suite for feature-api-keys. Talks to the
// workspace's HTTP surface over loopback (server hosted in-process via the
// declared "api" entrypoint) plus reflects on the declared "db" entrypoint
// using only its EXISTING stable export (`listAuditEvents`) for the audit
// check — never reaches into agent-defined internals by name.
import { discoverCreate, list, getById, create, discoverRevoke, req } from "./lib/probe.mjs";

function pushCase(cases, id, ok, detail) {
  cases.push({ id, ok, detail: detail !== undefined ? String(detail).slice(0, 800) : undefined });
}

const HASH_LIKE_RE = /\b[0-9a-f]{16,}:[0-9a-f]{16,}\b/i;

function bodyContains(text, needle) {
  return typeof text === "string" && needle && text.includes(needle);
}

export async function runHiddenTests(base, { db, seeded }) {
  const hf = [];
  const reg = [];
  const sec = [];
  const critical = {
    "no-cross-org-access": null,
    "no-raw-key-storage": null,
    "revoked-keys-rejected": null,
    "hash-not-exposed": null,
  };

  // login all seeded users via the (unchanged) session endpoint
  async function login(email, password) {
    const r = await req(base, "POST", "/login", { body: { email, password } });
    return r.json?.token;
  }
  const sessAdminA = await login(seeded.adminA.email, seeded.adminA.password);
  const sessMemberA = await login(seeded.memberA.email, seeded.memberA.password);
  const sessAdminB = await login(seeded.adminB.email, seeded.adminB.password);

  pushCase(reg, "reg-existing-login-still-works", !!sessAdminA && !!sessMemberA && !!sessAdminB, "seeded users authenticate via unchanged /login");

  // --- discover the create route ---
  const discovered = sessAdminA ? await discoverCreate(base, sessAdminA, "grader-key-orgA") : null;
  if (!discovered) {
    const detail = "no API-key create endpoint discovered among conventional candidate paths (feature likely absent)";
    pushCase(hf, "hf-api-key-endpoint-discoverable", false, detail);
    critical["no-cross-org-access"] = false;
    critical["no-raw-key-storage"] = false;
    critical["revoked-keys-rejected"] = false;
    critical["hash-not-exposed"] = false;
    return finalize(hf, reg, sec, critical, { discovered: false });
  }
  pushCase(hf, "hf-api-key-endpoint-discoverable", true, `basePath=${discovered.basePath}`);

  // --- creation shows the raw key once; also create a second key under org B ---
  const keyA = discovered;
  const rB = await create(base, discovered.basePath, sessAdminB, { name: "grader-key-orgB" });
  const idB = rB.json?.id;
  const rawKeyB = Object.entries(rB.json || {}).find(([k, v]) => typeof v === "string" && /key/i.test(k) && v !== idB)?.[1];
  pushCase(hf, "hf-create-shows-raw-key-once", typeof keyA.rawKey === "string" && keyA.rawKey.length >= 12, `rawKey length=${keyA.rawKey?.length}`);

  // --- hash-not-exposed: list must never include raw key or hash-shaped value ---
  const listA = await list(base, discovered.basePath, sessAdminA);
  const listText = listA.text || "";
  const noRawInList = !bodyContains(listText, keyA.rawKey);
  const noHashInList = !HASH_LIKE_RE.test(listText);
  const noRawInCreateResponseHash = !HASH_LIKE_RE.test(JSON.stringify(discovered.createBody || {}));
  const hashNotExposed = noRawInList && noHashInList && noRawInCreateResponseHash;
  pushCase(
    hf,
    "hf-hash-not-exposed-via-list-and-create",
    hashNotExposed,
    `noRawInList=${noRawInList} noHashInList=${noHashInList} createResponseHashFree=${noRawInCreateResponseHash}`
  );
  critical["hash-not-exposed"] = hashNotExposed;

  pushCase(
    hf,
    "hf-list-returns-metadata-with-id",
    listA.status === 200 && JSON.stringify(listA.json || "").includes(keyA.id),
    `status=${listA.status}`
  );

  // --- no-raw-key-storage: NEVER invoke agent-defined functions by guessed
  // name here (a prior version did and it accidentally called a mutating
  // revoke/create accessor, corrupting grading state — non-deterministic and
  // unsafe). Instead: (a) a strictly read-only, non-calling scan of exported
  // NON-function bindings (Maps/arrays/objects) for the raw-key literal, and
  // (b) the authoritative, safe HTTP-surface signal — the raw key must never
  // reappear in list/get-by-id responses after the one-time create reveal
  // (already covered by hash-not-exposed's noRawInList, reused here). ---
  let rawFoundInDb = false;
  let dbScanDetail = "no exported non-function db binding contained the raw key literal (read-only scan; HTTP-surface confirmed no re-exposure)";
  try {
    const seenObjs = new Set();
    const walk = (val, depth) => {
      if (depth > 4 || val == null) return;
      if (typeof val === "string") {
        if (val === keyA.rawKey) rawFoundInDb = true;
        return;
      }
      if (typeof val !== "object") return;
      if (seenObjs.has(val)) return;
      seenObjs.add(val);
      const entries = val instanceof Map ? [...val.entries()] : Array.isArray(val) ? val.entries() : Object.entries(val);
      for (const [, v] of entries) walk(v, depth + 1);
    };
    for (const [k, v] of Object.entries(db)) {
      if (typeof v === "function") continue; // read-only: never call exported functions here
      walk(v, 0);
      if (rawFoundInDb) {
        dbScanDetail = `raw key literal found reachable from exported non-function binding db.${k}`;
        break;
      }
    }
  } catch (err) {
    dbScanDetail = `db reflection error (non-fatal, treated as no-evidence): ${err.message}`;
  }
  const noRawStorage = !rawFoundInDb && noRawInList;
  pushCase(hf, "hf-no-raw-key-storage", noRawStorage, dbScanDetail);
  critical["no-raw-key-storage"] = noRawStorage;

  // --- authenticate with the raw API key against the list endpoint itself ---
  const authWithKey = await list(base, discovered.basePath, keyA.rawKey);
  pushCase(hf, "hf-authenticate-with-api-key", authWithKey.status === 200, `status=${authWithKey.status}`);

  // --- no-cross-org-access ---
  const crossOrgList = await list(base, discovered.basePath, sessAdminB);
  const crossOrgListLeaksA = bodyContains(JSON.stringify(crossOrgList.json || ""), keyA.id);
  const crossOrgDirect = await getById(base, discovered.basePath, keyA.id, sessAdminB);
  const crossOrgDirectDenied = crossOrgDirect.status === 403 || crossOrgDirect.status === 404;
  const crossOrgKeyAuthDenied = idB ? (await getById(base, discovered.basePath, idB, keyA.rawKey)).status !== 200 : true;
  const noCrossOrgAccess = !crossOrgListLeaksA && crossOrgDirectDenied && crossOrgKeyAuthDenied;
  pushCase(
    hf,
    "hf-no-cross-org-access",
    noCrossOrgAccess,
    `listLeaksA=${crossOrgListLeaksA} directDenied(${crossOrgDirect.status})=${crossOrgDirectDenied} keyAuthCrossOrgDenied=${crossOrgKeyAuthDenied}`
  );
  critical["no-cross-org-access"] = noCrossOrgAccess;

  // --- audit events on create (existing stable accessor: listAuditEvents) ---
  try {
    const events = db.listAuditEvents(seeded.orgA.id) || [];
    const createAudited = events.some((e) => /api.?key/i.test(e.action || "") && /creat/i.test(e.action || ""));
    pushCase(hf, "hf-audit-event-on-create", createAudited, `orgA audit actions=${JSON.stringify(events.map((e) => e.action))}`);
  } catch (err) {
    pushCase(hf, "hf-audit-event-on-create", false, String(err.message || err));
  }

  // --- revoke lifecycle (critical: revoked-keys-rejected) ---
  const revoked = await discoverRevoke(base, discovered.basePath, keyA.id, sessAdminA);
  if (!revoked) {
    pushCase(hf, "hf-revoke-endpoint-discoverable", false, "no revoke shape (DELETE/POST .../revoke/PATCH) succeeded");
    critical["revoked-keys-rejected"] = false;
  } else {
    pushCase(hf, "hf-revoke-endpoint-discoverable", true, `${revoked.shape.method} ${revoked.shape.path} -> ${revoked.response.status}`);
    const postRevokeAuth = await list(base, discovered.basePath, keyA.rawKey);
    const rejected = postRevokeAuth.status === 401 || postRevokeAuth.status === 403;
    pushCase(hf, "hf-revoked-key-immediately-rejected", rejected, `status=${postRevokeAuth.status}`);
    critical["revoked-keys-rejected"] = rejected;

    try {
      const events = db.listAuditEvents(seeded.orgA.id) || [];
      const revokeAudited = events.some((e) => /api.?key/i.test(e.action || "") && /revok/i.test(e.action || ""));
      pushCase(hf, "hf-audit-event-on-revoke", revokeAudited, `orgA audit actions=${JSON.stringify(events.map((e) => e.action))}`);
    } catch (err) {
      pushCase(hf, "hf-audit-event-on-revoke", false, String(err.message || err));
    }
  }

  // --- regression: existing /me and /logout endpoints unaffected ---
  try {
    const me = await req(base, "GET", "/me", { token: sessMemberA });
    pushCase(reg, "reg-me-endpoint-unaffected", me.status === 200 && me.json?.email === seeded.memberA.email, `status=${me.status}`);
  } catch (err) {
    pushCase(reg, "reg-me-endpoint-unaffected", false, String(err.message || err));
  }
  try {
    const lo = await req(base, "POST", "/logout", { token: sessMemberA });
    const after = await req(base, "GET", "/me", { token: sessMemberA });
    pushCase(reg, "reg-logout-still-revokes-session", lo.status === 200 && after.status === 401, `logout=${lo.status} me-after=${after.status}`);
  } catch (err) {
    pushCase(reg, "reg-logout-still-revokes-session", false, String(err.message || err));
  }

  // --- security/edge ---
  try {
    const bad = await req(base, "POST", discovered.basePath, { token: sessAdminA, body: {} });
    pushCase(sec, "sec-create-missing-name-handled", bad.status >= 400 && bad.status < 500, `status=${bad.status}`);
  } catch (err) {
    pushCase(sec, "sec-create-missing-name-handled", false, String(err.message || err));
  }
  try {
    const noAuth = await list(base, discovered.basePath, undefined);
    pushCase(sec, "sec-list-requires-auth", noAuth.status === 401, `status=${noAuth.status}`);
  } catch (err) {
    pushCase(sec, "sec-list-requires-auth", false, String(err.message || err));
  }
  try {
    const bogus = await list(base, discovered.basePath, "not-a-real-key-at-all");
    pushCase(sec, "sec-invalid-api-key-rejected", bogus.status === 401 || bogus.status === 403, `status=${bogus.status}`);
  } catch (err) {
    pushCase(sec, "sec-invalid-api-key-rejected", false, String(err.message || err));
  }
  try {
    const memberCreate = await create(base, discovered.basePath, sessMemberA, { name: "member-attempt" });
    // Non-admin creation should either be denied, or if allowed, must not
    // break isolation/hash guarantees already checked above; we only assert
    // it doesn't 500.
    pushCase(sec, "sec-non-admin-create-does-not-500", memberCreate.status < 500, `status=${memberCreate.status}`);
  } catch (err) {
    pushCase(sec, "sec-non-admin-create-does-not-500", false, String(err.message || err));
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
  return {
    hidden_functional: toCategory(hf),
    regression: toCategory(reg),
    security: toCategory(sec),
    criticalSignals: critical,
    meta,
  };
}
