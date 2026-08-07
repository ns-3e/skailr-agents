// DOC: hidden black-box test suite for patch-webhook. Talks only to the
// running HTTP server (public contract, PUBLIC_API.md), never imports
// workspace source. Concurrency probe fires K parallel identical requests
// in one microtask burst (Promise.all with no intervening await) so a
// check-then-act race in the workspace's ledger is deterministically
// exercised, not merely "usually" — kept under majority vote at the
// grade.mjs orchestration layer as an extra determinism safety margin.
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

function pushCase(cases, id, ok, detail) {
  const c = { id, ok };
  if (detail) c.detail = String(detail).slice(0, 500);
  cases.push(c);
}

/** One concurrency-burst trial. Returns { exactlyOne, consistentResults, detail }. */
async function concurrencyTrial(base, k) {
  const eventId = uid("evt_burst");
  const reqs = Array.from({ length: k }, () => post(base, { event_id: eventId, amount: 100, currency: "USD" }));
  const results = await Promise.all(reqs);
  const processed = results.filter((r) => r.json && r.json.status === "processed");
  const duplicates = results.filter((r) => r.json && r.json.status === "duplicate");
  const exactlyOne = processed.length === 1 && duplicates.length === k - 1;
  let consistentResults = true;
  if (processed.length >= 1) {
    const canonical = JSON.stringify(processed[0].json.result);
    consistentResults = results.every((r) => r.json && JSON.stringify(r.json.result) === canonical);
  } else {
    consistentResults = false;
  }
  return {
    exactlyOne,
    consistentResults,
    detail: `processed=${processed.length} duplicate=${duplicates.length} total=${k} statuses=${JSON.stringify(
      results.map((r) => r.status)
    )}`,
  };
}

/**
 * Runs the full hidden suite against a live server at `base`.
 * Returns { hidden_functional, regression, security } category objects
 * (each { passed, failed, total, cases }) plus a `criticalSignals` map used
 * by grade.mjs to derive critical_failures.
 */
export async function runHiddenTests(base, { trials = 3, concurrency = 25 } = {}) {
  const hf = [];
  const reg = [];
  const sec = [];

  // --- hidden_functional: exactly-once-processing (majority vote over trials) ---
  const trialResults = [];
  for (let i = 0; i < trials; i++) {
    try {
      trialResults.push(await concurrencyTrial(base, concurrency));
    } catch (err) {
      trialResults.push({ exactlyOne: false, consistentResults: false, detail: String(err.message || err) });
    }
  }
  const exactlyOneVotes = trialResults.filter((t) => t.exactlyOne).length;
  const exactlyOneMajority = exactlyOneVotes > trials / 2;
  pushCase(
    hf,
    "hf-exactly-once-processing",
    exactlyOneMajority,
    `majority=${exactlyOneVotes}/${trials}; last-trial: ${trialResults[trialResults.length - 1]?.detail}`
  );

  const consistentVotes = trialResults.filter((t) => t.consistentResults).length;
  const consistentMajority = consistentVotes > trials / 2;
  pushCase(
    hf,
    "hf-no-duplicate-ledger-entry-consistency",
    consistentMajority,
    `concurrent responses agree on a single stored result in ${consistentVotes}/${trials} trials`
  );

  // repeated (sequential, post-burst) submission returns the stored result
  try {
    const evId = uid("evt_seq");
    const first = await post(base, { event_id: evId, amount: 42, currency: "USD" });
    const second = await post(base, { event_id: evId, amount: 999, currency: "GBP" });
    const ok =
      first.json?.status === "processed" &&
      second.json?.status === "duplicate" &&
      JSON.stringify(second.json?.result) === JSON.stringify(first.json?.result);
    pushCase(hf, "hf-repeated-submission-returns-stored-result", ok, JSON.stringify({ first: first.json, second: second.json }));
  } catch (err) {
    pushCase(hf, "hf-repeated-submission-returns-stored-result", false, String(err.message || err));
  }

  // distinct events under concurrency remain independent
  try {
    const a = uid("evt_a");
    const b = uid("evt_b");
    const [ra, rb] = await Promise.all([
      post(base, { event_id: a, amount: 7, currency: "USD" }),
      post(base, { event_id: b, amount: 8, currency: "EUR" }),
    ]);
    const ok =
      ra.json?.status === "processed" &&
      rb.json?.status === "processed" &&
      ra.json?.result?.amount === 7 &&
      rb.json?.result?.amount === 8;
    pushCase(hf, "hf-distinct-events-independent-under-concurrency", ok, JSON.stringify({ ra: ra.json, rb: rb.json }));
  } catch (err) {
    pushCase(hf, "hf-distinct-events-independent-under-concurrency", false, String(err.message || err));
  }

  // --- regression: sequential/basic behavior from the fixture's own visible suite ---
  try {
    const r = await post(base, { event_id: uid("evt_new"), amount: 100, currency: "USD" });
    pushCase(reg, "reg-new-event-processed-200", r.status === 200 && r.json?.status === "processed", JSON.stringify(r));
  } catch (err) {
    pushCase(reg, "reg-new-event-processed-200", false, String(err.message || err));
  }
  try {
    const evId = uid("evt_dup_seq");
    const first = await post(base, { event_id: evId, amount: 50, currency: "EUR" });
    const second = await post(base, { event_id: evId, amount: 999, currency: "GBP" });
    const ok = second.json?.status === "duplicate" && second.json?.result?.amount === 50 && second.json?.result?.currency === "EUR";
    pushCase(reg, "reg-sequential-duplicate-returns-original", ok, JSON.stringify({ first: first.json, second: second.json }));
  } catch (err) {
    pushCase(reg, "reg-sequential-duplicate-returns-original", false, String(err.message || err));
  }
  try {
    const a = uid("evt_ra");
    const b = uid("evt_rb");
    await post(base, { event_id: a, amount: 1, currency: "USD" });
    await post(base, { event_id: b, amount: 2, currency: "USD" });
    const dupA = await post(base, { event_id: a, amount: 1, currency: "USD" });
    const dupB = await post(base, { event_id: b, amount: 2, currency: "USD" });
    const ok = dupA.json?.status === "duplicate" && dupB.json?.status === "duplicate";
    pushCase(reg, "reg-distinct-events-each-independently-idempotent", ok, JSON.stringify({ dupA: dupA.json, dupB: dupB.json }));
  } catch (err) {
    pushCase(reg, "reg-distinct-events-each-independently-idempotent", false, String(err.message || err));
  }

  // --- security/edge: input validation + contract-preserving error shapes ---
  try {
    const res = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const json = await res.json().catch(() => null);
    pushCase(sec, "sec-malformed-json-400", res.status === 400 && json?.error === "invalid_json", JSON.stringify({ status: res.status, json }));
  } catch (err) {
    pushCase(sec, "sec-malformed-json-400", false, String(err.message || err));
  }
  try {
    const r = await post(base, { amount: 5, currency: "USD" });
    pushCase(sec, "sec-missing-event-id-400", r.status === 400 && r.json?.error === "invalid_event", JSON.stringify(r));
  } catch (err) {
    pushCase(sec, "sec-missing-event-id-400", false, String(err.message || err));
  }
  try {
    const r = await post(base, { event_id: "e1", amount: "not-a-number", currency: "USD" });
    pushCase(sec, "sec-wrong-type-amount-400", r.status === 400 && r.json?.error === "invalid_event", JSON.stringify(r));
  } catch (err) {
    pushCase(sec, "sec-wrong-type-amount-400", false, String(err.message || err));
  }
  try {
    const res = await fetch(`${base}/webhooks`, { method: "GET" });
    const json = await res.json().catch(() => null);
    pushCase(sec, "sec-wrong-method-404", res.status === 404 && json?.error === "not_found", JSON.stringify({ status: res.status, json }));
  } catch (err) {
    pushCase(sec, "sec-wrong-method-404", false, String(err.message || err));
  }
  try {
    const res = await fetch(`${base}/other-path`, { method: "POST", body: "{}" });
    const json = await res.json().catch(() => null);
    pushCase(sec, "sec-wrong-path-404", res.status === 404 && json?.error === "not_found", JSON.stringify({ status: res.status, json }));
  } catch (err) {
    pushCase(sec, "sec-wrong-path-404", false, String(err.message || err));
  }
  try {
    // Large-ish payload edge case must not crash the server (checked by a
    // follow-up liveness probe).
    const bigId = "e".repeat(20000);
    await post(base, { event_id: bigId, amount: 1, currency: "USD" });
    const alive = await fetch(`${base}/webhooks`, { method: "GET" });
    pushCase(sec, "sec-large-payload-does-not-crash-server", alive.status === 404, `post-large-payload liveness status=${alive.status}`);
  } catch (err) {
    pushCase(sec, "sec-large-payload-does-not-crash-server", false, String(err.message || err));
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
      "exactly-once-processing": exactlyOneMajority,
      "no-duplicate-ledger-entry": consistentMajority,
      "api-contract-preserved": reg.every((c) => c.ok) && sec.every((c) => c.ok),
    },
    determinism: { trials, concurrency, exactlyOneVotes, consistentVotes },
  };
}
