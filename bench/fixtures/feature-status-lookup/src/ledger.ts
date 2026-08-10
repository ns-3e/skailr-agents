// Webhook processing ledger.
//
// DOC: exactly-once processing. Concurrent POST /webhooks calls sharing an
// event_id are deduplicated via an in-flight promise map: the first caller
// registers a promise synchronously (before any await); a concurrent racer
// sees that in-flight promise and awaits it, returning "duplicate" with the
// shared result once processing completes. A later, sequential caller for
// the same event_id finds the finished ledger entry directly.

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
const inFlight = new Map<string, Promise<ProcessOutcome>>();

function findEntry(eventId: string): LedgerEntry | undefined {
  return ledger.find((e) => e.eventId === eventId);
}

// Simulates the work of processing a webhook payload (e.g. writing to a
// downstream system). The artificial delay widens the race window so
// concurrent-dedup behavior is exercisable by concurrent requests.
async function doProcessing(event: WebhookEvent): Promise<ProcessedResult> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return {
    amount: event.amount,
    currency: event.currency,
    receivedAt: Date.now(),
  };
}

async function processNew(event: WebhookEvent): Promise<ProcessOutcome> {
  const result = await doProcessing(event);
  ledger.push({ eventId: event.event_id, result, processedAt: Date.now() });
  return { event_id: event.event_id, status: "processed", result };
}

export async function processEvent(event: WebhookEvent): Promise<ProcessOutcome> {
  const existing = findEntry(event.event_id);
  if (existing) {
    return { event_id: event.event_id, status: "duplicate", result: existing.result };
  }
  if (inFlight.has(event.event_id)) {
    const outcome = await inFlight.get(event.event_id)!;
    return { event_id: event.event_id, status: "duplicate", result: outcome.result };
  }
  const p = processNew(event);
  inFlight.set(event.event_id, p);
  try {
    return await p;
  } finally {
    inFlight.delete(event.event_id);
  }
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
  inFlight.clear();
}
