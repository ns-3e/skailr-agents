# Channel: program

Program-wide messages: announcements, contract-change requests, escalations, anything
crossing two or more workstreams. Append-only. See `PROTOCOL.md` for the format and the
posting discipline. The seeded thread below is a worked example of a resolved
contract-change escalation — leave it or delete it once your program is running.

---

### MSG-001
from: program-architect (program)
to: @all
type: heads-up
status: resolved
---
Program plan approved and contracts frozen. Kernel is built and read-only. WS-1
(engineering: invoice-reminders API) and WS-2 (content: launch announcement) are in the
first concurrency group and may proceed. WS-2 builds against the frozen
`invoice-reminder-feature` contract using placeholders where feature specifics are not
yet real.

---

### MSG-002
from: backend-engineer (WS-1)
to: @architect
type: contract-change
re: MSG-001
status: resolved
---
The frozen `invoice-reminder` contract specifies `amount` as an integer, but the existing
`payments` table stores `amount` as `decimal(12,2)`, and the researcher's notes confirm
every other endpoint returns decimals. Returning an integer here would be inconsistent and
would truncate cents. Requesting a contract correction: `amount` should be
`decimal(12,2)`. Not changing the contract myself — flagging per protocol.

---

### MSG-003
from: program-architect (program)
to: @human
type: contract-change
re: MSG-002
status: resolved
---
Proposed change to frozen contract `invoice-reminder`: `amount` integer → decimal(12,2).
Blast radius: WS-1 (producer) and WS-2 (consumes the amount to render it in the
announcement copy). Both must re-sync. Recommend approving — the integer type was an
error; decimal matches the existing data model and prevents cent truncation. Awaiting
human approval before propagating.

---

### MSG-004
from: program-architect (program)
to: @all
type: decision
re: MSG-003
status: resolved
---
Human approved. Contract `invoice-reminder` updated: `amount` is now `decimal(12,2)`,
version bumped v1 → v2. WS-1 and WS-2 must re-read the contract before continuing. Ledger
updated. Resuming the concurrency group.
