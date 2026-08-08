// DOC: Regenerates the existing markdown/JSON views from DB state so today's
// readers (agents that `cat ledger.md`, scripts like check-ownership.mjs)
// need zero changes. Freeform narrative sections that aren't DB-backed
// (Notes, Blockers prose, board.md's Destination/Done/Out-of-scope) are
// preserved verbatim from the existing file rather than clobbered — these
// functions splice DB-derived tables into the existing document shape, they
// do not treat the whole file as disposable.
import fs from "node:fs";

function extractSection(text, heading) {
  if (!text) return null;
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /\n##\s+/.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : "";
}

// ---------------------------------------------------------------------------
// ownership.json — matches .claude/program/schemas/ownership.schema.json
// ---------------------------------------------------------------------------
export function renderOwnershipJson({ baseRef, kernelGlobs, rules }) {
  const owners = new Map();
  for (const r of rules) {
    if (!owners.has(r.owner)) {
      owners.set(r.owner, { id: r.owner, team: r.team || "engineering", workstream: r.workstream || undefined, units: [] });
    }
    owners.get(r.owner).units.push(r.glob);
  }
  const doc = {
    schema: "skailr.ownership/v1",
    baseRef: baseRef || "HEAD",
    ...(kernelGlobs && kernelGlobs.length
      ? { kernel: { globs: kernelGlobs.filter((g) => !g.frozen).map((g) => g.glob).concat(kernelGlobs.filter((g) => g.frozen).map((g) => g.glob)), frozen: kernelGlobs.some((g) => g.frozen) } }
      : {}),
    owners: [...owners.values()],
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// ledger.md — matches .claude/program/schemas/ledger.template.md
// ---------------------------------------------------------------------------
export function renderLedger({ program, name, contracts, contractChanges, workstreamRows }, existingContent) {
  const gates = [
    ["brief_confirmed", program.brief_confirmed_at],
    ["plan_approved", program.plan_approved_at],
    ["contracts_frozen", program.contracts_frozen_at],
  ];
  const gateRows = gates
    .map(([g, at]) => `| ${g} | ${at ? "done" : "pending"} | ${fmtDate(at)} | | |`)
    .join("\n");

  const phaseRows = (program.phases || [])
    .map((p) => `| ${p.phase} | ${p.status} | ${p.commit_sha || ""} | ${fmtDate(p.completed_at)} |`)
    .join("\n");

  const contractRows = (contracts || []).map((c) => `| ${c.contract_id} | ${c.version} | ${c.status} | ${c.path || ""} |`).join("\n");

  const wsRows = (workstreamRows || [])
    .map((w) => `| ${w.workstream} | ${w.team} | ${w.feature} | ${w.feature_phase} | ${w.status} |`)
    .join("\n");

  const preservedBlockers = extractSection(existingContent, "Blockers") || "Open inbox items (channel MSG ids or approval ids). Empty when clear.";
  const preservedNotes = extractSection(existingContent, "Notes") || "Append-only operational notes. Prefer channel messages for cross-team items.";

  const changeLogRows = (contractChanges || [])
    .map((c) => `| ${fmtDate(c.at)} | ${c.contract_id} | ${c.from_version} → ${c.to_version} | ${c.by} | ${c.reason} | |`)
    .join("\n");

  return `---
schema: skailr.ledger/v1
program: ${program.id}
status: ${program.status}
updated: ${fmtDate(program.updated_at)}
---

# Program Ledger: ${name || program.id}

## Gates

| Gate | Status | At | By | Notes |
|------|--------|----|----|-------|
${gateRows}

## Phases

| Phase | Status | Commit | Completed |
|-------|--------|--------|-----------|
${phaseRows}

## Contract versions

| Contract ID | Version | Status | Path |
|-------------|---------|--------|------|
${contractRows}
${
  changeLogRows
    ? `
### Contract change log

| At | Contract | v | By | Reason | Must re-sync |
|----|----------|---|----|--------|--------------|
${changeLogRows}
`
    : ""
}
## Workstream cursors

One row per feature (from plan.md Features). A workstream is complete when every feature row for that workstream is \`complete\`. Feature phase mirrors the nested feature pipeline: \`research\` | \`story\` | \`spec\` | \`build\` | \`verify\` | \`validate\` | \`docs\` | \`complete\`. Artifact root: \`.claude/program/workstreams/<ws>/features/<slug>/\`.

| Workstream | Team | Feature | Feature phase | Status |
|------------|------|---------|---------------|--------|
${wsRows}

## Blockers

${preservedBlockers}

## Notes

${preservedNotes}
`;
}

// ---------------------------------------------------------------------------
// progress.md — matches .claude/program/schemas/feature-progress.template.md
// ---------------------------------------------------------------------------
export function renderProgress({ feature, name, tickets }, existingContent) {
  const phaseRows = (feature.phases || [])
    .map((p) => `| ${p.phase} | ${p.status} | ${fmtDate(p.completed_at)} | ${p.notes || ""} |`)
    .join("\n");

  const ticketRows = (tickets && tickets.length ? tickets : null)
    ?.map((t) => `| ${t.id} | ${t.title} | ${t.status} | tickets/${t.id}-report.md |`)
    .join("\n");

  const preservedNotes =
    extractSection(existingContent, "Notes") || "Append-only operational notes (resume hints, partial failures, `handoff: <path> (yield N)`). Do not reset on resume.";
  const preservedHandoffs = extractSection(existingContent, "Handoffs");
  const preservedBuildSlice = extractSection(existingContent, "Build slice (when build is in_progress)");

  return `---
schema: skailr.feature-progress/v1
feature: ${feature.id}
mode: ${feature.mode}
status: ${feature.status}
updated: ${fmtDate(feature.updated_at)}
request: ${feature.artifact_root}/request.md
---

# Feature Progress: ${name || feature.id}

Artifact root (\`ARTIFACT_ROOT\`): \`${feature.artifact_root}\`

## Phases

| Phase | Status | Completed | Notes |
|-------|--------|-----------|-------|
${phaseRows}

## Tickets (when board exists)

Prefer this table when \`<ARTIFACT_ROOT>/board.md\` exists. Status mirrors ticket frontmatter. Script: \`ticket-status.mjs --root <ARTIFACT_ROOT>\`.

| ID | Title | Status | Report |
|----|-------|--------|--------|
${ticketRows || ""}
${
  preservedBuildSlice
    ? `
## Build slice (when build is in_progress)

${preservedBuildSlice}
`
    : ""
}${
    preservedHandoffs
      ? `
## Handoffs

${preservedHandoffs}
`
      : ""
  }
## Notes

${preservedNotes}
`;
}

// ---------------------------------------------------------------------------
// program.md / feature.md / ws-<name>.md channel files — matches
// .claude/program/channels/PROTOCOL.md message format
// ---------------------------------------------------------------------------
export function renderChannel(messages, header) {
  const seqWidth = 3;
  const body = messages
    .map((m) => {
      const seq = String(m.id).padStart(seqWidth, "0");
      const re = m.ref_msg_id ? `\nre: MSG-${String(m.ref_msg_id).padStart(seqWidth, "0")}` : "";
      return `### MSG-${seq}\nfrom: ${m.from_role}${m.from_scope ? ` (${m.from_scope})` : ""}\nto: ${m.to_role}\ntype: ${m.type}${re}\nstatus: ${m.status}\n---\n${m.body}`;
    })
    .join("\n\n");
  return `${header || ""}\n\n${body}\n`.replace(/\n{3,}/g, "\n\n");
}

export function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
