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

  it("fills blast_radius from channel body on demo seed", () => {
    const store = new SkailrStore({ path: ":memory:" });
    seedDemoProgram(store, demoDir);
    const ap = store.listApprovals("open").find((a) => (a as { id: string }).id === "ap-MSG-0001") as
      | { blast_radius: string }
      | undefined;
    assert.ok(ap);
    const blast = JSON.parse(String(ap.blast_radius || "[]")) as string[];
    assert.deepEqual(blast, ["orders-web", "orders-api"]);
  });
});

describe("decision loop", () => {
  it("resolves channel MSG and records channel.posted on approve", () => {
    const store = new SkailrStore({ path: ":memory:" });
    store.upsertProgram({ id: "parallel-api", name: "parallel-api", status: "building", nextPhase: "B_workstreams" });
    store.upsertChannelMessage({
      id: "MSG-0001",
      programId: "parallel-api",
      type: "blocker",
      status: "open",
      to: "@human",
      from: "orders-web",
      body: "Need confirmation.\nBlast radius: orders-web, orders-api.",
      file: join(demoDir, "channels/program.md"),
    });
    store.createApproval({
      id: "ap-MSG-0001",
      kind: "human",
      programId: "parallel-api",
      subject: "blocker MSG-0001",
      blastRadius: ["orders-web", "orders-api"],
    });
    const decided = store.decideApproval("ap-MSG-0001", "approve", "UUIDs confirmed");
    assert.equal(decided?.status, "approved");
    assert.equal(decided?.channel?.parentId, "MSG-0001");
    assert.ok(decided?.channel?.replyId);

    const parent = store.getChannelMessage("MSG-0001");
    assert.equal(parent?.status, "resolved");
    const events = store.listEvents({ programId: "parallel-api" });
    assert.ok(events.some((e) => e.type === "approval.decided"));
    assert.ok(events.some((e) => e.type === "channel.posted"));
    const decisions = store.listRecentDecisions(5);
    assert.equal(decisions[0]?.decision, "approve");
    assert.equal(decisions[0]?.messageId, "MSG-0001");
  });
});
