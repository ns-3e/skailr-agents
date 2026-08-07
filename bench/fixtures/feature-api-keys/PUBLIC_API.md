# PUBLIC_API — feature-api-keys

## Architecture (existing, do not restructure)

- `src/types.ts` — shared domain types (Org, User, Session, AuditEvent, PublicUser).
- `src/persistence/db.ts` — in-memory persistence layer. Id-keyed `Map`s + narrow accessor
  functions (`createX`/`getX`/`listXByY`). No ORM. New entities should follow this same
  pattern and live in this file (or a sibling file re-exported the same way).
- `src/auth/hash.ts` — `hashSecret`/`verifySecret` (scrypt + salt, timing-safe compare).
  Reuse this for any new secret material; never store a raw secret.
- `src/auth/session.ts` — session issuance/validation (`login`, `logout`, `authenticateSession`,
  `extractBearerToken`). Bearer-token scheme via the `Authorization` header.
- `src/http/server.ts` — HTTP entrypoint. `createServer(): http.Server`. Run with
  `node src/http/server.ts` (listens on `$PORT` or `3000`).

## Existing endpoints

### `POST /login`

Request: `{ "email": string, "password": string }`
Response `200`: `{ "token": string, "expires_at": number }`
Response `401`: `{ "error": "invalid_credentials" }` (unknown email or wrong password)
Response `400`: `{ "error": "invalid_request", "detail": string }`

### `GET /me`

Auth: `Authorization: Bearer <session token>`
Response `200`: `{ "id": string, "orgId": string, "email": string, "role": "admin"|"member" }`
Response `401`: `{ "error": "unauthorized" }` (missing/invalid/expired token)

### `POST /logout`

Auth: `Authorization: Bearer <session token>`
Response `200`: `{ "status": "logged_out" }`; the token is revoked and immediately stops
authenticating.
Response `401`: `{ "error": "unauthorized" }`

## Audit scaffolding (existing, currently only used by login)

`persistence/db.ts::addAuditEvent({ orgId, actorUserId, action, target?, metadata? })` appends
an `AuditEvent`; `listAuditEvents(orgId)` reads them back, scoped to one org. `action` is a
short machine-readable verb (existing example: `"user.login"`).

## Missing feature (task target)

Organization-scoped API keys (create / list / revoke) are **not implemented**. There is no
API-key persistence, no API-key auth middleware, and no `/api-keys`-style route group yet.
Session auth above must keep working unchanged. Follow the existing module layout
(persistence accessor functions in `src/persistence/`, hashing via `src/auth/hash.ts`, a new
route group in `src/http/`) when adding it.
