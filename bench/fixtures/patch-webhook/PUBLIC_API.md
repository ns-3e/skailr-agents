# PUBLIC_API — patch-webhook

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

### Idempotency contract (what the grader checks)

- Each `event_id` is processed **at most once**.
- Repeated submissions (sequential OR concurrent) of the same `event_id` return the result from the first successful processing.
- Two concurrent `POST /webhooks` requests with the same `event_id` must not create two ledger entries and must not run `doProcessing` twice.
- Distinct `event_id`s are always processed independently.

### Error responses

| Status | Condition | Body |
|---|---|---|
| 400 | Malformed JSON body | `{ "error": "invalid_json" }` |
| 400 | `event_id`/`amount`/`currency` missing or wrong type | `{ "error": "invalid_event", "detail": "..." }` |
| 400 | Body unreadable | `{ "error": "invalid_body" }` |
| 404 | Any method/path other than `POST /webhooks` | `{ "error": "not_found" }` |
| 500 | Unhandled internal error | `{ "error": "internal_error" }` |

## Known defect (task target)

`src/ledger.ts::processEvent` has a check-then-act race (see inline `DOC:` comment). The public
contract above must be preserved by any fix; only the internal dedup mechanism should change.
