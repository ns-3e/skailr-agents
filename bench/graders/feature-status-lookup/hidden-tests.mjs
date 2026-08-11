// DOC: hidden black-box test suite for feature-status-lookup. Talks only to
// the running HTTP server (public contract, PUBLIC_API.md), never imports
// workspace source. Covers (a) the existing POST /webhooks contract is
// unchanged (regression), (b) the new GET /webhooks/:event_id/status
// endpoint for a known event_id (functional), (c) 404 for an unknown
// event_id (functional/critical), (d) malformed/missing event_id handled
// per the existing error-response conventions (security/edge).
import assert from "node:assert/strict";

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function post(base, body, { raw } = {}) {
  const res = await fetch(`${base}/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body, leave null */
  }
  return { status: res.status, json };
}

async function getStatus(base, eventId) {
  const res = await fetch(`${base}/webhooks/${encodeURIComponent(eventId)}/status`, { method: "GET" });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body, leave null */
  }
  return { status: res.status, json };
}

function pushCase(cases, id, ok, detail) {
  const c = { id, ok };
  if (detail) c.detail = String(detail).slice(0, 500);
  cases.push(c);
}

/**
 * Runs the full hidden suite against a live server at `base`.
 * Returns { hidden_functional, regression, security } category objects
 * (each { passed, failed, total, cases }) plus a `criticalSignals` map used
 * by grade.mjs to derive critical_failures.
 */
export async function runHiddenTests(base) {
  const hf = [];
  const reg = [];
  const sec = [];

  // --- hidden_functional: GET status for a known, already-processed event ---
  let getStatusKnownOk = false;
  try {
    const evId = uid("evt_known");
    const posted = await post(base, { event_id: evId, amount: 17, currency: "USD" });
    const looked = await getStatus(base, evId);
    getStatusKnownOk =
      looked.status === 200 &&
      looked.json?.event_id === evId &&
      looked.json?.status === "processed" &&
      JSON.stringify(looked.json?.result) === JSON.stringify(posted.json?.result);
    pushCase(
      hf,
      "hf-get-status-known-event-returns-stored-result",
      getStatusKnownOk,
      JSON.stringify({ posted: posted.json, looked: looked.json })
    );
  } catch (err) {
    pushCase(hf, "hf-get-status-known-event-returns-stored-result", false, String(err.message || err));
  }

  // --- hidden_functional: GET status reflects the ORIGINAL result, not a later duplicate submission ---
  try {
    const evId = uid("evt_dedup_status");
    const first = await post(base, { event_id: evId, amount: 5, currency: "USD" });
    await post(base, { event_id: evId, amount: 12345, currency: "GBP" }); // duplicate, ignored payload
    const looked = await getStatus(base, evId);
    const ok = looked.status === 200 && JSON.stringify(looked.json?.result) === JSON.stringify(first.json?.result);
    pushCase(
      hf,
      "hf-get-status-reflects-original-not-later-duplicate",
      ok,
      JSON.stringify({ first: first.json, looked: looked.json })
    );
  } catch (err) {
    pushCase(hf, "hf-get-status-reflects-original-not-later-duplicate", false, String(err.message || err));
  }

  // --- hidden_functional (critical): GET status for an unknown event_id returns 404 ---
  let unknown404Ok = false;
  try {
    const looked = await getStatus(base, uid("evt_never_seen"));
    unknown404Ok = looked.status === 404 && typeof looked.json?.error === "string";
    pushCase(hf, "hf-get-status-unknown-event-404", unknown404Ok, JSON.stringify(looked));
  } catch (err) {
    pushCase(hf, "hf-get-status-unknown-event-404", false, String(err.message || err));
  }

  // --- regression: POST /webhooks contract is byte-for-byte unchanged ---
  try {
    const r = await post(base, { event_id: uid("evt_new"), amount: 100, currency: "USD" });
    pushCase(reg, "reg-post-new-event-200", r.status === 200 && r.json?.status === "processed", JSON.stringify(r));
  } catch (err) {
    pushCase(reg, "reg-post-new-event-200", false, String(err.message || err));
  }
  try {
    const evId = uid("evt_dup_seq");
    const first = await post(base, { event_id: evId, amount: 50, currency: "EUR" });
    const second = await post(base, { event_id: evId, amount: 999, currency: "GBP" });
    const ok = second.json?.status === "duplicate" && second.json?.result?.amount === 50 && second.json?.result?.currency === "EUR";
    pushCase(reg, "reg-post-sequential-duplicate-returns-original", ok, JSON.stringify({ first: first.json, second: second.json }));
  } catch (err) {
    pushCase(reg, "reg-post-sequential-duplicate-returns-original", false, String(err.message || err));
  }
  try {
    const a = uid("evt_ra");
    const b = uid("evt_rb");
    const [ra, rb] = await Promise.all([
      post(base, { event_id: a, amount: 7, currency: "USD" }),
      post(base, { event_id: b, amount: 8, currency: "EUR" }),
    ]);
    const ok = ra.json?.status === "processed" && rb.json?.status === "processed" && ra.json?.result?.amount === 7 && rb.json?.result?.amount === 8;
    pushCase(reg, "reg-post-distinct-events-independent-under-concurrency", ok, JSON.stringify({ ra: ra.json, rb: rb.json }));
  } catch (err) {
    pushCase(reg, "reg-post-distinct-events-independent-under-concurrency", false, String(err.message || err));
  }
  try {
    const res = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const json = await res.json().catch(() => null);
    pushCase(reg, "reg-post-malformed-json-400", res.status === 400 && json?.error === "invalid_json", JSON.stringify({ status: res.status, json }));
  } catch (err) {
    pushCase(reg, "reg-post-malformed-json-400", false, String(err.message || err));
  }
  try {
    const r = await post(base, { amount: 5, currency: "USD" });
    pushCase(reg, "reg-post-missing-event-id-400", r.status === 400 && r.json?.error === "invalid_event", JSON.stringify(r));
  } catch (err) {
    pushCase(reg, "reg-post-missing-event-id-400", false, String(err.message || err));
  }

  // --- security/edge: malformed/missing event_id on the new endpoint, wrong methods, large input ---
  try {
    // Empty event_id segment: /webhooks//status
    const res = await fetch(`${base}/webhooks//status`, { method: "GET" });
    const json = await res.json().catch(() => null);
    const ok = res.status === 400 || res.status === 404; // either a validation 400 or a route-miss 404 is an acceptable "sensible" handling
    pushCase(sec, "sec-get-status-empty-event-id-handled", ok && typeof json?.error === "string", JSON.stringify({ status: res.status, json }));
  } catch (err) {
    pushCase(sec, "sec-get-status-empty-event-id-handled", false, String(err.message || err));
  }
  try {
    // Wrong method on the status path.
    const evId = uid("evt_wrong_method");
    await post(base, { event_id: evId, amount: 1, currency: "USD" });
    const res = await fetch(`${base}/webhooks/${evId}/status`, { method: "POST" });
    const json = await res.json().catch(() => null);
    pushCase(sec, "sec-get-status-wrong-method-not-2xx", res.status >= 400, JSON.stringify({ status: res.status, json }));
  } catch (err) {
    pushCase(sec, "sec-get-status-wrong-method-not-2xx", false, String(err.message || err));
  }
  try {
    const res = await fetch(`${base}/webhooks`, { method: "GET" });
    const json = await res.json().catch(() => null);
    pushCase(sec, "sec-get-webhooks-collection-404", res.status === 404 && json?.error === "not_found", JSON.stringify({ status: res.status, json }));
  } catch (err) {
    pushCase(sec, "sec-get-webhooks-collection-404", false, String(err.message || err));
  }
  try {
    // Large-ish event_id must not crash the server (checked by a follow-up liveness probe).
    const bigId = "e".repeat(20000);
    await getStatus(base, bigId);
    const alive = await fetch(`${base}/webhooks`, { method: "GET" });
    pushCase(sec, "sec-large-event-id-does-not-crash-server", alive.status === 404, `post-large-event-id liveness status=${alive.status}`);
  } catch (err) {
    pushCase(sec, "sec-large-event-id-does-not-crash-server", false, String(err.message || err));
  }

  const toCategory = (cases) => ({
    passed: cases.filter((c) => c.ok).length,
    failed: cases.filter((c) => !c.ok).length,
    total: cases.length,
    cases,
  });

  return {
    hidden_functional: toCategory(hf),
    regression: toCategory(reg),
    security: toCategory(sec),
    criticalSignals: {
      "get-status-endpoint-implemented": getStatusKnownOk,
      "post-webhooks-contract-preserved": reg.every((c) => c.ok),
      "unknown-event-id-404": unknown404Ok,
    },
  };
}
