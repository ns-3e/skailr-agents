# Orientation: feature-status-lookup

## Stack
Node.js 22+, TypeScript (executed directly via Node's native `.ts` stripping —
no build step, no bundler), plain `node:http` (no web framework), npm with a
committed lockfile, `node --test` + `node:assert/strict` as the test runner.
No database — state is an in-memory ledger array. No deployment target beyond
`node src/server.ts` listening on `$PORT`.

## Directory Boundaries
| Concern | Path | Notes |
|---------|------|-------|
| Backend | `src/` | `server.ts` (HTTP layer) + `ledger.ts` (in-memory processing/dedup) |
| Frontend | — | none; this is a headless HTTP service |
| Shared types | `src/ledger.ts` | `WebhookEvent`, `ProcessOutcome`, `ProcessedResult`, `LedgerEntry` exported from here and imported by `server.ts` |
| Tests | `test/` | `server.test.ts` (HTTP-level, black-box via `fetch`), `ledger.test.ts` (module-level) |
| Migrations | — | none; no persistent store |
| Config | `package.json`, `tsconfig.json` | no env-driven config beyond `$PORT` |

## Design System / Brand Visuals
none / greenfield — no UI, no design system. This is a backend-only HTTP service.

## Representative Vertical Slices
### Webhook ingestion (POST /webhooks)
- Paths: `src/server.ts`, `src/ledger.ts`, `test/server.test.ts`, `test/ledger.test.ts`
- How it works: `server.ts` reads/parses the JSON body, validates shape via
  `isValidEvent`, then calls `ledger.ts`'s `processEvent(event)`. `ledger.ts`
  dedups concurrent/sequential calls for the same `event_id` via an in-flight
  promise map plus the finished-entry array, and returns
  `{ event_id, status: "processed" | "duplicate", result }`. `server.ts` wraps
  that outcome straight into a `200` JSON response.

## House Conventions
| Topic | Path | Excerpt |
|---|---|---|
| Routing | `src/server.ts::handleRequest` | Single `if (method && url match)` branch per route, else falls through to a shared `404 { error: "not_found" }`. No router library. |
| Validation | `src/server.ts::isValidEvent` | Hand-written type guard; reject with `400 { error: "invalid_event", detail }` before touching business logic. |
| Error handling | `src/server.ts::sendJson` + `PUBLIC_API.md` | Every error response is `{ "error": "<code>" }`, optionally `+ "detail"`. `createServer()` wraps `handleRequest` in a `.catch` that falls back to `500 { error: "internal_error" }`. |
| State / dedup | `src/ledger.ts` | In-memory array (`ledger: LedgerEntry[]`) plus an in-flight `Map<eventId, Promise>` set *synchronously* before the first `await`, so concurrent racers for the same key await the same promise instead of double-processing. |
| Testing | `test/*.test.ts` | `node --test` + `node:assert/strict`. `server.test.ts` talks to a real `http.Server` instance over `fetch` (never imports handler internals for assertions); `ledger.test.ts` calls the module directly. Both reset shared state via the test-only `__resetLedgerForTests()` export. |
| API client | n/a | no client code in this repo; consumers are external, documented in `PUBLIC_API.md`. |
| Public contract docs | `PUBLIC_API.md` | Kept in sync with `src/server.ts` by hand; treat it as the source of truth for status codes and error shapes when adding a route. |

## Data Model overview
- `LedgerEntry { eventId: string; result: ProcessedResult; processedAt: number }` — one per successfully processed `event_id`, appended to the in-memory `ledger` array in `src/ledger.ts`. Never mutated after insert.
- `ProcessedResult { amount: number; currency: string; receivedAt: number }` — the payload snapshot taken at first-processing time; this is what's returned on every subsequent "duplicate" response for that `event_id`.
- No relationships beyond the flat array; `event_id` is the sole lookup key today (linear `find`/`filter` scans — fine at fixture scale, not indexed).

## Cross-cutting Risks
- No persistence: the ledger is process-memory only; a restart loses all history. Acceptable for this fixture; would not be for a real deployment.
- No auth/signature verification on `POST /webhooks` (explicitly out of scope per the code's own `DOC:` comment in `server.ts`) — do not treat this fixture's lack of auth as a pattern to copy into a real service.
- `event_id` lookups are O(n) linear scans (`ledger.find`/`.filter`); fine at fixture scale, would need an index (e.g. a `Map`) before real-world volume.

## Open Questions
None — the repo is small enough that the code fully answers stack, boundaries, and conventions without ambiguity.
