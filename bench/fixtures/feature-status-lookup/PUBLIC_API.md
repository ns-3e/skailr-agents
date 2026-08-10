# PUBLIC_API — feature-status-lookup

## Service

`src/server.ts` exports `createServer(): http.Server` and `handleRequest(req, res)`.
Run directly with `node src/server.ts` (listens on `$PORT` or `3000`).

## Endpoint

### `POST /webhooks`

Request body (JSON):

```json
{ "event_id": "string (non-empty, required)", "amount": "number (required)", "currency": "string (required)" }
```

Success response — `200 OK`:

```json
{
  "event_id": "string",
  "status": "processed" | "duplicate",
  "result": { "amount": number, "currency": "string", "receivedAt": number }
}
```

- `status: "processed"` — first time this `event_id` has been seen; `result` reflects this request's payload.
- `status: "duplicate"` — `event_id` was already processed; `result` is the **originally stored** result (the new payload's `amount`/`currency`, if different, is ignored).

### Idempotency contract

- Each `event_id` is processed **at most once**.
- Repeated submissions (sequential OR concurrent) of the same `event_id` return the result from the first successful processing.
- Two concurrent `POST /webhooks` requests with the same `event_id` must not create two ledger entries and must not run the processing work twice.
- Distinct `event_id`s are always processed independently.

### Error response conventions (apply to every endpoint on this service)

| Status | Condition | Body |
|---|---|---|
| 400 | Malformed JSON body | `{ "error": "invalid_json" }` |
| 400 | `event_id`/`amount`/`currency` missing or wrong type | `{ "error": "invalid_event", "detail": "..." }` |
| 400 | Body unreadable | `{ "error": "invalid_body" }` |
| 404 | Any method/path not recognized by the service | `{ "error": "not_found" }` |
| 500 | Unhandled internal error | `{ "error": "internal_error" }` |

Any new endpoint added to this service should reuse these same error shapes
(`{ "error": "<code>" }`, optionally `"detail"`) rather than inventing a new
error contract.

## Known gap (task target)

There is currently no way to look up whether a given `event_id` has already
been processed short of resubmitting the same `POST /webhooks` payload (which
requires knowing the original `amount`/`currency`). A read-only status-lookup
endpoint is the target of this benchmark task; see the task prompt for the
exact contract expected.
