import test from "node:test";
import assert from "node:assert/strict";
import { processEvent, ledgerSize, __resetLedgerForTests } from "../src/ledger.ts";

test.beforeEach(() => {
  __resetLedgerForTests();
});

test("processes a new event and returns status processed", async () => {
  const outcome = await processEvent({ event_id: "evt_1", amount: 100, currency: "USD" });
  assert.equal(outcome.status, "processed");
  assert.equal(outcome.event_id, "evt_1");
  assert.equal(outcome.result.amount, 100);
  assert.equal(outcome.result.currency, "USD");
});

test("repeated sequential submission of the same event_id returns the stored result as duplicate", async () => {
  const first = await processEvent({ event_id: "evt_2", amount: 50, currency: "EUR" });
  const second = await processEvent({ event_id: "evt_2", amount: 999, currency: "GBP" });
  assert.equal(second.status, "duplicate");
  // Must return the previously stored result, not reprocess the new payload.
  assert.equal(second.result.amount, first.result.amount);
  assert.equal(second.result.currency, first.result.currency);
});

test("distinct event_ids are each processed independently", async () => {
  await processEvent({ event_id: "evt_a", amount: 1, currency: "USD" });
  await processEvent({ event_id: "evt_b", amount: 2, currency: "USD" });
  assert.equal(ledgerSize(), 2);
});

test("sequential duplicate submission does not grow the ledger", async () => {
  await processEvent({ event_id: "evt_3", amount: 10, currency: "USD" });
  await processEvent({ event_id: "evt_3", amount: 10, currency: "USD" });
  await processEvent({ event_id: "evt_3", amount: 10, currency: "USD" });
  assert.equal(ledgerSize(), 1);
});
