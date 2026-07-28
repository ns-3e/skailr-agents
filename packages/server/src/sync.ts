import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseChannelMessages, parseFrontmatter, extractPhaseTable, nextIncompletePhase } from "@skailr/core";
import type { SkailrStore } from "./store.js";

function parseFm(text: string): Record<string, unknown> {
  return parseFrontmatter(text).data;
}

/** Extract blast-radius tokens from channel body / subject text. */
export function parseBlastRadius(text: string): string[] {
  const m = text.match(/blast\s*radius:\s*([^\n]+)/i);
  if (!m) return [];
  return m[1]!
    .split(/,| and /i)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter((s) => s.length > 0 && s !== "—");
}

export function importProgramDir(store: SkailrStore, programDir: string, programId = "default") {
  const ledgerPath = join(programDir, "ledger.md");
  if (existsSync(ledgerPath)) {
    const text = readFileSync(ledgerPath, "utf8");
    const fm = parseFm(text);
    const body = parseFrontmatter(text).body;
    const phases = extractPhaseTable(body);
    const next = nextIncompletePhase(phases);
    const id = String(fm.program || programId);
    const existed = (store.listPrograms() as Array<Record<string, unknown>>).some(
      (p) => p.id === id,
    );
    store.upsertProgram({
      id,
      name: String(fm.program || programId),
      status: String(fm.status || "planning"),
      nextPhase: next ?? undefined,
    });
    if (!existed) {
      store.appendEvent({
        type: "program.created",
        actor: "sync",
        programId: id,
        payload: { source: ledgerPath, next },
      });
    }
  }

  const contractsDir = join(programDir, "contracts");
  if (existsSync(contractsDir)) {
    for (const f of readdirSync(contractsDir).filter((x) => x.endsWith(".md"))) {
      const text = readFileSync(join(contractsDir, f), "utf8");
      const fm = parseFm(text);
      if (!fm.id) continue;
      const status = String(fm.status || "draft").split("|")[0]!.trim();
      store.upsertContract({
        id: String(fm.id),
        programId: String(fm.program || programId),
        version: Number(fm.version || 1),
        status,
        path: join(contractsDir, f),
      });
      if (status === "frozen") {
        store.appendEvent({
          type: "contract.frozen",
          actor: "sync",
          programId,
          payload: { contractId: fm.id, version: fm.version },
        });
      }
    }
  }

  const channelsDir = join(programDir, "channels");
  if (existsSync(channelsDir)) {
    for (const f of readdirSync(channelsDir).filter((x) => x.endsWith(".md") && x !== "PROTOCOL.md")) {
      const boardPath = join(channelsDir, f);
      const text = readFileSync(boardPath, "utf8");
      const { messages } = parseChannelMessages(text);
      for (const m of messages) {
        store.upsertChannelMessage({
          id: m.id,
          programId,
          type: m.type,
          status: m.status,
          to: m.to,
          from: m.from,
          body: m.body,
          file: boardPath,
        });
        if (
          m.status === "open" ||
          m.type === "contract-change" ||
          m.to.includes("@human")
        ) {
          const approvalId = `ap-${m.id}`;
          const existing = store.listApprovals().find((a) => {
            const row = a as Record<string, unknown>;
            return row.id === approvalId;
          });
          if (!existing) {
            store.appendEvent({
              type: "inbox.escalated",
              actor: m.from,
              programId,
              payload: { messageId: m.id, type: m.type, to: m.to },
            });
          }
          const blast = parseBlastRadius(`${m.type} ${m.id}: ${m.body}`);
          store.createApproval({
            id: approvalId,
            kind: m.type === "contract-change" ? "contract" : "human",
            programId,
            subject: `${m.type} ${m.id}: ${m.body.slice(0, 120)}`,
            blastRadius: blast,
          });
        }
      }
    }
  }
}

export function exportLedgerStub(
  store: SkailrStore,
  programId: string,
  outPath: string,
) {
  const programs = store.listPrograms() as Array<Record<string, unknown>>;
  const p = programs.find((x) => x.id === programId) || programs[0];
  if (!p) return;
  const contracts = store.listContracts(String(p.id)) as Array<Record<string, unknown>>;
  const md = `---
schema: skailr.ledger/v1
program: ${p.id}
status: ${p.status}
updated: ${p.updated_at}
---

# Program Ledger: ${p.name}

## Phases

| Phase | Status | Commit | Completed |
|-------|--------|--------|-----------|
| A_kernel | ${p.next_phase === "A_kernel" ? "in_progress" : "pending"} | | |
| B_workstreams | ${p.next_phase === "B_workstreams" ? "in_progress" : "pending"} | | |
| C_integration | ${p.next_phase === "C_integration" ? "in_progress" : "pending"} | | |
| D_validation | ${p.next_phase === "D_validation" ? "in_progress" : "pending"} | | |
| E_documentation | ${p.next_phase === "E_documentation" ? "in_progress" : "pending"} | | |

## Contract versions

| Contract ID | Version | Status | Path |
|-------------|---------|--------|------|
${contracts.map((c) => `| ${c.id} | ${c.version} | ${c.status} | ${c.path || ""} |`).join("\n")}

## Blockers

${blockersSection(store)}
`;
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, md);
}

function blockersSection(store: SkailrStore): string {
  const open = store.inbox() as Array<Record<string, unknown>>;
  const decisions = store.listRecentDecisions(5);
  const lines: string[] = [];
  if (open.length === 0) lines.push("None open.");
  else {
    for (const m of open) {
      lines.push(`- ${m.id} (${m.type}, ${m.status}) → ${m.to_addr}`);
    }
  }
  if (decisions.length) {
    lines.push("");
    lines.push("### Recent human decisions");
    for (const d of decisions) {
      lines.push(
        `- ${d.ts}: **${d.decision}** ${d.approvalId}` +
          (d.messageId ? ` (${d.messageId})` : "") +
          (d.reason ? ` — ${d.reason}` : ""),
      );
    }
  }
  return lines.join("\n");
}

/** Append a decision block to a channel markdown board (append-only). */
export function appendDecisionToChannelFile(
  filePath: string,
  reply: {
    id: string;
    from: string;
    to: string;
    re: string;
    decision: string;
    body: string;
  },
  parentId: string,
  parentStatus: string,
): void {
  if (!existsSync(filePath)) return;
  let text = readFileSync(filePath, "utf8");
  // Flip parent status in-place (protocol allows status-line edit)
  text = text.replace(
    new RegExp(`(### ${parentId}\\n[\\s\\S]*?status:\\s*)\\S+`),
    `$1${parentStatus}`,
  );
  const block = `
### ${reply.id}
from: ${reply.from}
to: ${reply.to}
type: decision
re: ${reply.re}
status: resolved
---
${reply.body}
`;
  writeFileSync(filePath, text.trimEnd() + "\n" + block);
}

export function writeResumeBrief(
  store: SkailrStore,
  outPath: string,
  programId?: string,
): void {
  const programs = store.listPrograms() as Array<Record<string, unknown>>;
  const p =
    (programId && programs.find((x) => x.id === programId)) || programs[0];
  const decisions = store.listRecentDecisions(10);
  const open = store.listApprovals("open") as Array<Record<string, unknown>>;
  const md = `# Skailr resume brief

Generated: ${new Date().toISOString()}

## Program
- id: ${p?.id ?? "(none)"}
- status: ${p?.status ?? "(none)"}
- next_phase: ${p?.next_phase ?? "(unknown)"}

## Open inbox
${open.length === 0 ? "None." : open.map((a) => `- ${a.id}: ${a.subject}`).join("\n")}

## Human decisions to apply (do not re-ask)
${
  decisions.length === 0
    ? "None yet."
    : decisions
        .map(
          (d) =>
            `- **${d.decision}** on ${d.approvalId}` +
            (d.messageId ? ` / ${d.messageId}` : "") +
            (d.subject ? `\n  Subject: ${d.subject}` : "") +
            (d.reason ? `\n  Reason: ${d.reason}` : ""),
        )
        .join("\n")
}

## Orchestrator instructions
1. Treat the decisions above as settled. Do not re-open them with @human unless new facts appear.
2. If a decision was **approve** on a contract-change, have program-architect apply the contract bump and re-dispatch affected workstreams.
3. If **reject**, keep the frozen contract; notify the posting team via channel.
4. If **defer**, leave the thread blocked-on-human and continue unrelated workstreams.
5. Resume at next_phase using \`/continue-program\` / \`/build-program\` rules.
`;
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, md);
}

/**
 * After decideApproval: mirror channel markdown + ledger + resume brief.
 * Never mutates files under examples/ — copies into programDir first.
 */
export function persistDecisionArtifacts(
  store: SkailrStore,
  approval: {
    id: string;
    programId?: string;
    channel?: { parentId?: string; replyId?: string; file?: string };
  },
  decision: "approve" | "reject" | "defer",
  reason: string | undefined,
  programDir: string,
): void {
  const parentId = approval.channel?.parentId;
  const replyId = approval.channel?.replyId;
  let file = approval.channel?.file;
  if (parentId && replyId && file) {
    const isFixture = /(?:^|[/\\])examples[/\\]/.test(file);
    if (isFixture) {
      const base = file.split(/[/\\]/).pop() || "program.md";
      const mirrored = join(programDir, "channels", base);
      mkdirSync(join(programDir, "channels"), { recursive: true });
      if (!existsSync(mirrored) && existsSync(file)) {
        writeFileSync(mirrored, readFileSync(file, "utf8"));
      }
      file = mirrored;
    }
    if (existsSync(file)) {
      const parentStatus = decision === "defer" ? "blocked-on-human" : "resolved";
      const replyMsg = store.getChannelMessage(replyId);
      appendDecisionToChannelFile(
        file,
        {
          id: replyId,
          from: "human (control-plane)",
          to: String(replyMsg?.to_addr || "@all"),
          re: parentId,
          decision,
          body: String(replyMsg?.body || `Human decision: ${decision}`),
        },
        parentId,
        parentStatus,
      );
    }
  }

  // Always keep a twin under the active program dir for orchestrators
  const twinDir = join(programDir, "channels");
  mkdirSync(twinDir, { recursive: true });
  const twin = join(twinDir, "decisions.md");
  const existing = existsSync(twin) ? readFileSync(twin, "utf8") : "# Control-plane decisions\n";
  const block = `
### ${approval.channel?.replyId || approval.id}
from: human (control-plane)
to: @all
type: decision
re: ${approval.channel?.parentId || approval.id}
status: resolved
---
Human decision: **${decision}** on ${approval.id}${reason ? `\nReason: ${reason}` : ""}
`;
  writeFileSync(twin, existing.trimEnd() + "\n" + block);

  if (approval.programId) {
    exportLedgerStub(store, approval.programId, join(programDir, "ledger.md"));
  }
  writeResumeBrief(store, join(programDir, "resume-brief.md"), approval.programId);
}

/** True when the store has nothing useful to show in the CEO UI. */
export function storeNeedsDemoSeed(store: SkailrStore): boolean {
  return store.listPrograms().length === 0 && store.listApprovals().length === 0;
}

/**
 * Import examples/parallel-api into the store.
 * @returns whether a seed import ran
 */
export function seedDemoProgram(
  store: SkailrStore,
  demoDir: string,
  opts?: { force?: boolean },
): { seeded: boolean; reason: string } {
  if (!existsSync(demoDir)) {
    return { seeded: false, reason: `demo dir missing: ${demoDir}` };
  }
  if (!opts?.force && !storeNeedsDemoSeed(store)) {
    return { seeded: false, reason: "store already has programs or approvals" };
  }
  importProgramDir(store, demoDir, "parallel-api");
  return { seeded: true, reason: "imported parallel-api demo" };
}
