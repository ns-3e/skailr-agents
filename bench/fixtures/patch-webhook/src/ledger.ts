// Webhook processing ledger.
//
// DOC: KNOWN DEFECT (intentional, for benchmark purposes): processEvent()
// below has a check-then-act race. Two concurrent calls with the same
// event_id both observe "not yet in ledger" before either has finished
// `doProcessing`, so both proceed to process and both push a ledger entry.
// The public HTTP contract (POST /webhooks) must not change while fixing
// this; only the dedup mechanism inside this module needs to change.

export interface LedgerEntry {
  eventId: string;
  result: ProcessedResult;
  processedAt: number;
}

export interface ProcessedResult {
  amount: number;
  currency: string;
  receivedAt: number;
}

export interface WebhookEvent {
  event_id: string;
  amount: number;
  currency: string;
}

export type ProcessOutcome = {
  event_id: string;
  status: "processed" | "duplicate";
  result: ProcessedResult;
};

// In-memory ledger. A real service would back this with a database; the
// fixture keeps it in-memory to avoid an external dependency.
const ledger: LedgerEntry[] = [];

function findEntry(eventId: string): LedgerEntry | undefined {
  return ledger.find((e) => e.eventId === eventId);
}

// Simulates the work of processing a webhook payload (e.g. writing to a
// downstream system). The artificial delay widens the race window so the
// bug is exercisable by concurrent requests.
async function doProcessing(event: WebhookEvent): Promise<ProcessedResult> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return {
    amount: event.amount,
    currency: event.currency,
    receivedAt: Date.now(),
  };
}

export async function processEvent(event: WebhookEvent): Promise<ProcessOutcome> {
  const existing = findEntry(event.event_id);
  if (existing) {
    return { event_id: event.event_id, status: "duplicate", result: existing.result };
  }

  const result = await doProcessing(event);

  ledger.push({ eventId: event.event_id, result, processedAt: Date.now() });

  return { event_id: event.event_id, status: "processed", result };
}

export function ledgerEntryCount(eventId: string): number {
  return ledger.filter((e) => e.eventId === eventId).length;
}

export function ledgerSize(): number {
  return ledger.length;
}

// Test-only helper: reset in-memory state between test files/cases.
export function __resetLedgerForTests(): void {
  ledger.length = 0;
}
