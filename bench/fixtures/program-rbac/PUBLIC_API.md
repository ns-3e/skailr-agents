# PUBLIC_API — program-rbac

## Layout (path-based monorepo — plain relative imports, no npm workspaces)

```
apps/api/src/server.ts               HTTP entrypoint
apps/api/src/auth/{hash,session}.ts  existing session auth
apps/web/src/components/*.ts         render-to-string UI components (no browser/bundler)
apps/web/src/pages/*.ts              page compositions
packages/db/src/db.ts                in-memory persistence (orgs/users/members/sessions)
packages/contracts/src/types.ts      shared domain types
packages/email/src/adapter.ts        mock email adapter (existing, working)
packages/audit/src/audit.ts          audit log (existing, working)
```

## Existing endpoints (`apps/api/src/server.ts`, `createServer(): http.Server`)

### `POST /login`
Request: `{ "email": string, "password": string }`
`200`: `{ "token": string, "expires_at": number }`
`401`: `{ "error": "invalid_credentials" }`
`400`: `{ "error": "invalid_request", "detail": string }`

### `GET /me`
Auth: `Authorization: Bearer <session token>`
`200`: `{ "id": string, "email": string }`
`401`: `{ "error": "unauthorized" }`

### `POST /logout`
Auth: `Authorization: Bearer <session token>`
`200`: `{ "status": "logged_out" }` (token revoked immediately)
`401`: `{ "error": "unauthorized" }`

### `GET /orgs/:orgId/members`
Auth: `Authorization: Bearer <session token>`; requester must be a member of `:orgId`.
`200`: `{ "members": [{ "userId": string, "email": string, "role": "admin"|"member" }] }`
`403`: `{ "error": "forbidden" }` (authenticated but not a member of this org)
`401`: `{ "error": "unauthorized" }`

## Existing persistence (`packages/db/src/db.ts`)

`createOrg`, `createUser`, `findUserByEmail`, `addMember`, `getMember`, `listMembers`,
`removeMember`, `updateMemberRole`, `countAdmins`, `createSession`/`getSession`/`revokeSession`.
An `OrgMember` is `{ orgId, userId, role: "admin" | "member" }`.

## Existing email adapter (`packages/email/src/adapter.ts`)

`sendEmail({ to, subject, body })` — captures the message in an in-memory outbox instead of
sending anything externally. `getOutbox()` / `findEmailsTo(email)` for assertions. No real
external email dependency; use this adapter for invitation emails.

## Existing audit package (`packages/audit/src/audit.ts`)

`logEvent({ orgId, actorUserId, action, target?, metadata? })` appends an event;
`listEvents(orgId)` reads them back, scoped to one org.

## Existing web components (`apps/web/src`, no browser/DOM needed)

`renderMembersList(members: PublicMember[]): string` and
`renderOrganizationSettingsPage(vm): string` — pure functions returning HTML strings,
testable directly under `node:test`.

## Missing feature (task target)

Team invitations and RBAC are **not implemented**:
- No invitation entity/persistence, no create/list/revoke/accept endpoints.
- No role-based authorization enforcement (e.g. admin-only actions) beyond the existing
  plain org-membership check on `GET /orgs/:orgId/members`.
- No "last admin" protection on role changes/removal.
- No invitations UI in `apps/web` (only the members list exists today).

Existing endpoints/persistence/email/audit above must keep working unchanged. Follow the
existing module layout and conventions (accessor-function persistence in `packages/db`,
audit calls via `packages/audit`, email via `packages/email`, pure-function UI components
in `apps/web`) when adding the feature.
