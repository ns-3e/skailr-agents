import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SkailrStore } from "./store.js";
import { seedDemoProgram, storeNeedsDemoSeed } from "./sync.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const demoDir = join(root, "examples/parallel-api");

describe("SkailrStore", () => {
  it("records approvals and lineage events", () => {
    const store = new SkailrStore({ path: ":memory:" });
    store.upsertProgram({ id: "demo", name: "demo", status: "building", nextPhase: "B_workstreams" });
    const ap = store.createApproval({
      kind: "contract",
      subject: "Bump API contract",
      programId: "demo",
      blastRadius: ["web"],
    });
    const decided = store.decideApproval(ap.id, "approve", "ok");
    assert.equal(decided?.status, "approved");
    const events = store.listEvents({ programId: "demo" });
    assert.ok(events.some((e) => e.type === "approval.requested"));
    assert.ok(events.some((e) => e.type === "approval.decided"));
  });
});

describe("demo seed", () => {
  it("seeds parallel-api when store is empty and is idempotent", () => {
    const store = new SkailrStore({ path: ":memory:" });
    assert.equal(storeNeedsDemoSeed(store), true);
    const first = seedDemoProgram(store, demoDir);
    assert.equal(first.seeded, true);
    assert.ok(store.listPrograms().length >= 1);
    assert.ok(store.listApprovals("open").length >= 1);
    assert.ok(store.listContracts().length >= 1);

    const second = seedDemoProgram(store, demoDir);
    assert.equal(second.seeded, false);

    const forced = seedDemoProgram(store, demoDir, { force: true });
    assert.equal(forced.seeded, true);
    const opens = store.listApprovals("open");
    const ids = opens.map((r) => (r as { id: string }).id);
    assert.equal(ids.length, new Set(ids).size);
  });
});
