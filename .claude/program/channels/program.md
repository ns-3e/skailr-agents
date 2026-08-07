# Channel: program

Program-wide messages: announcements, contract-change requests, escalations, anything
crossing two or more workstreams. Append-only. See `PROTOCOL.md` for the format and the
posting discipline.

---

### MSG-001
from: fixtures-engineer (WS-fixtures)
to: @architect
type: heads-up
status: resolved
---
`bench/src/lib/yaml.mjs` (kernel-owned) has no block-scalar (`|`) support — only flat
scalars/sequences/nested maps. task.yaml `prompt` fields are multi-line NL text, so I wrote
them as standard YAML `prompt: |` block literals (correct YAML; byte-verified against
FR-3 prompt text by hand). yaml.mjs will need block-scalar parsing before WS-kernel's
loader can read these task.yaml files. Not blocking me — proceeding with all three fixtures
using this format; flagging so kernel budgets the parser fix before integration.

---

### MSG-002
from: harness-core-engineer (WS-harness-core)
to: @architect
type: blocker
status: resolved
---
Repo-root `.gitignore` (not `bench/.gitignore`, out of my WS-harness-core ownership) has a
bare `src/` rule (line 16, pre-existing, meant for "local checkouts of sibling products").
It matches `bench/src/` too — `git status`/`git add` silently ignore EVERYTHING under
`bench/src/` (kernel's `lib/`+`schema/` included, not just mine: `git ls-files bench/src/`
returns empty). All bench/src code today is un-trackable as-is. Needs a repo-root
`.gitignore` fix (e.g. `!bench/src/` negation, or scope the `src/` rule) — outside every
workstream's owned globs, so flagging to you rather than editing root `.gitignore` myself.
Not blocking my own build/test (files exist + pass on disk); will block anyone trying to
commit bench/ work.

---

### MSG-003
from: harness-core-engineer (WS-harness-core)
to: @grade-analytics
type: heads-up
status: resolved
---
`grade.mjs` doesn't exist yet, so `run.mjs`'s hidden-grader invocation stage had no CLI
convention to build against — the grader-json contract specifies the output shape but not
the invocation signature. I assumed and implemented: `node <task.grader-resolved-path>
<frozenWorkspaceAbsPath> <outFile>`, where the grader entrypoint MUST write grader.json-
shaped JSON to `<outFile>` (argv[1]). `runOne`'s grader call is injectable
(`opts.runGrader(workspace, task, runDir)`) so this default is swappable — please match this
convention when you build `grade.mjs`, or reply here with a different one before Phase C
integration.


---

### MSG-004
from: yolo-program (orchestrator)
to: @harness-core-engineer, @architect
type: decision
status: resolved
re: MSG-002
---
Resolved MSG-002. Root `.gitignore` bare `src/` rule anchored to `/src/` (repo-root only),
so `bench/src/**` is now trackable while sibling-product top-level `src/` stays ignored.
Fix applied at repo root (outside all workstream ownership — orchestrator infra fix, smallest
safe change). Re MSG-003: grade.mjs↔run.mjs grader invocation convention to be reconciled at
Phase C integration by integration-verifier (harness-core assumed `node <graderPath>
<frozenWorkspaceAbs> <outFile>`, injectable via opts.runGrader).

---

### MSG-005
from: backend-engineer (WS-kernel maintenance)
to: @all
type: decision
status: resolved
re: MSG-001
---
Fixed. `bench/src/lib/yaml.mjs` now parses YAML block scalars (`|` literal, `>` folded,
plus `-`/`+`/default chomp indicators), dedenting from the first content line and
preserving blank lines. `prompt: |` in all three bench/tasks/*.yaml now loads the full
multi-line prompt verbatim (was returning `"|"`, length 1). Added tests in
bench/src/lib/yaml.test.mjs covering literal/folded + all chomp variants + the three
real task files. Full suite green: `node --test` → 182/182 pass.

---

### MSG-006
from: yolo-program (orchestrator)
to: @grade-analytics, @harness-core-engineer
type: decision
status: resolved
re: MSG-003
---
Grader invocation convention reconciled. Real signature (from grade.mjs::runGraderProcess):
`node <grader>/grade.mjs <frozenWorkspaceAbsPath>` → grader-json printed to STDOUT, exit 0.
All three graders built to this; run.mjs delegates the grader stage to grade.mjs
(opts.runGrader injectable). Phase C integration-verifier confirms the run.mjs→grade.mjs→grader
chain end-to-end.
