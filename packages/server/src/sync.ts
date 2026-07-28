import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseChannelMessages, parseFrontmatter, extractPhaseTable, nextIncompletePhase } from "@skailr/core";
import type { SkailrStore } from "./store.js";

function parseFm(text: string): Record<string, unknown> {
  return parseFrontmatter(text).data;
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
      const text = readFileSync(join(channelsDir, f), "utf8");
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
          store.createApproval({
            id: approvalId,
            kind: m.type === "contract-change" ? "contract" : "human",
            programId,
            subject: `${m.type} ${m.id}: ${m.body.slice(0, 120)}`,
            blastRadius: [],
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
`;
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, md);
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
