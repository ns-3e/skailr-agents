import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Approval, SkailrEvent } from "@skailr/core";

export type StoreOptions = { path?: string };

type Row = Record<string, unknown>;

type DbShape = {
  events: Row[];
  approvals: Row[];
  programs: Row[];
  initiatives: Row[];
  contracts: Row[];
  channel_messages: Row[];
};

function emptyDb(): DbShape {
  return {
    events: [],
    approvals: [],
    programs: [],
    initiatives: [],
    contracts: [],
    channel_messages: [],
  };
}

/** Pure-JS durable store (JSON file). Avoids native better-sqlite3 ABI mismatches across Node versions. */
export class SkailrStore {
  private path: string | null;
  private data: DbShape;

  constructor(opts: StoreOptions = {}) {
    const raw = opts.path ?? ":memory:";
    this.path = raw === ":memory:" ? null : raw.replace(/\.db$/i, ".json");
    this.data = emptyDb();
    if (this.path && existsSync(this.path)) {
      try {
        this.data = { ...emptyDb(), ...JSON.parse(readFileSync(this.path, "utf8")) };
      } catch {
        this.data = emptyDb();
      }
    }
  }

  private persist() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  appendEvent(
    partial: Omit<SkailrEvent, "id" | "ts"> & { id?: string; ts?: string },
  ): SkailrEvent {
    const event: SkailrEvent = {
      id: partial.id ?? randomUUID(),
      ts: partial.ts ?? new Date().toISOString(),
      type: partial.type,
      actor: partial.actor,
      programId: partial.programId,
      initiativeId: partial.initiativeId,
      correlationId: partial.correlationId,
      payload: partial.payload ?? {},
    };
    this.data.events.push({
      id: event.id,
      type: event.type,
      ts: event.ts,
      actor: event.actor,
      program_id: event.programId ?? null,
      initiative_id: event.initiativeId ?? null,
      correlation_id: event.correlationId ?? null,
      payload: JSON.stringify(event.payload),
    });
    this.persist();
    return event;
  }

  listEvents(filter?: { programId?: string; type?: string }): SkailrEvent[] {
    let rows = [...this.data.events];
    if (filter?.programId) {
      rows = rows.filter((r) => r.program_id === filter.programId);
    }
    if (filter?.type) {
      rows = rows.filter((r) => r.type === filter.type);
    }
    rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    return rows.map((r) => ({
      id: String(r.id),
      type: r.type as SkailrEvent["type"],
      ts: String(r.ts),
      actor: String(r.actor),
      programId: (r.program_id as string) || undefined,
      initiativeId: (r.initiative_id as string) || undefined,
      correlationId: (r.correlation_id as string) || undefined,
      payload: JSON.parse(String(r.payload || "{}")),
    }));
  }

  upsertProgram(p: {
    id: string;
    initiativeId?: string;
    name: string;
    status: string;
    nextPhase?: string;
  }) {
    const row = {
      id: p.id,
      initiative_id: p.initiativeId ?? null,
      name: p.name,
      status: p.status,
      next_phase: p.nextPhase ?? null,
      updated_at: new Date().toISOString(),
    };
    const i = this.data.programs.findIndex((r) => r.id === p.id);
    if (i >= 0) this.data.programs[i] = row;
    else this.data.programs.push(row);
    this.persist();
  }

  listPrograms() {
    return [...this.data.programs].sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at)),
    );
  }

  upsertInitiative(i: {
    id: string;
    portfolioId?: string;
    name: string;
    status: string;
  }) {
    const row = {
      id: i.id,
      portfolio_id: i.portfolioId ?? null,
      name: i.name,
      status: i.status,
      updated_at: new Date().toISOString(),
    };
    const idx = this.data.initiatives.findIndex((r) => r.id === i.id);
    if (idx >= 0) this.data.initiatives[idx] = row;
    else this.data.initiatives.push(row);
    this.persist();
  }

  listInitiatives() {
    return [...this.data.initiatives].sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at)),
    );
  }

  upsertContract(c: {
    id: string;
    programId?: string;
    version: number;
    status: string;
    path?: string;
  }) {
    const row = {
      id: c.id,
      program_id: c.programId ?? null,
      version: c.version,
      status: c.status,
      path: c.path ?? null,
      updated_at: new Date().toISOString(),
    };
    const i = this.data.contracts.findIndex((r) => r.id === c.id);
    if (i >= 0) this.data.contracts[i] = row;
    else this.data.contracts.push(row);
    this.persist();
  }

  listContracts(programId?: string) {
    let rows = [...this.data.contracts];
    if (programId) rows = rows.filter((r) => r.program_id === programId);
    return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  upsertChannelMessage(m: {
    id: string;
    programId?: string;
    type: string;
    status: string;
    to: string;
    from: string;
    body: string;
    raw?: string;
    file?: string;
  }) {
    const row = {
      id: m.id,
      program_id: m.programId ?? null,
      type: m.type,
      status: m.status,
      to_addr: m.to,
      from_addr: m.from,
      body: m.body,
      raw: m.raw ?? null,
      file: m.file ?? null,
    };
    const i = this.data.channel_messages.findIndex((r) => r.id === m.id);
    if (i >= 0) {
      this.data.channel_messages[i] = {
        ...this.data.channel_messages[i],
        ...row,
        file: m.file ?? this.data.channel_messages[i]!.file ?? null,
      };
    } else this.data.channel_messages.push(row);
    this.persist();
  }

  getChannelMessage(id: string): Row | undefined {
    return this.data.channel_messages.find((r) => r.id === id);
  }

  nextMessageId(): string {
    let max = 0;
    for (const m of this.data.channel_messages) {
      const n = Number(String(m.id).replace(/^MSG-/, ""));
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return `MSG-${String(max + 1).padStart(4, "0")}`;
  }

  listRecentDecisions(limit = 10): Array<{
    approvalId: string;
    decision: string;
    reason?: string;
    messageId?: string;
    ts: string;
    programId?: string;
    subject?: string;
  }> {
    return this.listEvents({ type: "approval.decided" })
      .slice(-limit)
      .reverse()
      .map((e) => {
        const payload = e.payload as Record<string, unknown>;
        const approvalId = String(payload.approvalId || "");
        const msgId = approvalId.startsWith("ap-") ? approvalId.slice(3) : undefined;
        const ap = this.data.approvals.find((a) => a.id === approvalId);
        return {
          approvalId,
          decision: String(payload.decision || ""),
          reason: payload.reason ? String(payload.reason) : undefined,
          messageId: msgId,
          ts: e.ts,
          programId: e.programId,
          subject: ap ? String(ap.subject) : undefined,
        };
      });
  }

  /**
   * Resolve the channel thread linked to an approval (ap-MSG-xxxx) and append a decision reply.
   */
  resolveApprovalChannel(
    approvalId: string,
    decision: "approve" | "reject" | "defer",
    reason?: string,
  ): { parentId?: string; replyId?: string; file?: string } {
    if (!approvalId.startsWith("ap-")) return {};
    const parentId = approvalId.slice(3);
    const parent = this.getChannelMessage(parentId);
    if (!parent) return {};

    const parentStatus =
      decision === "defer" ? "blocked-on-human" : "resolved";
    this.upsertChannelMessage({
      id: parentId,
      programId: (parent.program_id as string) || undefined,
      type: String(parent.type),
      status: parentStatus,
      to: String(parent.to_addr),
      from: String(parent.from_addr),
      body: String(parent.body),
      file: (parent.file as string) || undefined,
    });

    const replyId = this.nextMessageId();
    const body =
      `Human decision: **${decision}**` +
      (reason ? `\nReason: ${reason}` : "") +
      `\n(Resolves ${parentId} via control-plane approval ${approvalId})`;
    this.upsertChannelMessage({
      id: replyId,
      programId: (parent.program_id as string) || undefined,
      type: "decision",
      status: "resolved",
      to: String(parent.from_addr),
      from: "human (control-plane)",
      body,
      file: (parent.file as string) || undefined,
      raw: `re:${parentId}`,
    });
    const replyRow = this.getChannelMessage(replyId);
    if (replyRow) {
      replyRow.re = parentId;
      this.persist();
    }

    this.appendEvent({
      type: "channel.posted",
      actor: "human",
      programId: (parent.program_id as string) || undefined,
      payload: {
        messageId: replyId,
        type: "decision",
        re: parentId,
        decision,
        approvalId,
      },
    });

    return {
      parentId,
      replyId,
      file: (parent.file as string) || undefined,
    };
  }

  inbox() {
    return this.data.channel_messages
      .filter((m) => {
        const status = String(m.status || "");
        if (status === "resolved" || status === "answered") return false;
        return (
          status === "open" ||
          status === "blocked-on-human" ||
          m.type === "contract-change" ||
          String(m.to_addr || "").includes("@human")
        );
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  createApproval(a: Omit<Approval, "id" | "createdAt" | "status"> & { id?: string }): Approval {
    const id = a.id ?? randomUUID();
    const existing = this.data.approvals.find((r) => r.id === id);
    if (existing) {
      const currentBlast = JSON.parse(String(existing.blast_radius || "[]")) as string[];
      if ((!currentBlast || currentBlast.length === 0) && a.blastRadius?.length) {
        existing.blast_radius = JSON.stringify(a.blastRadius);
        this.persist();
      }
      return {
        id: String(existing.id),
        kind: existing.kind as Approval["kind"],
        status: existing.status as Approval["status"],
        programId: (existing.program_id as string) || undefined,
        subject: String(existing.subject),
        blastRadius: JSON.parse(String(existing.blast_radius || "[]")),
        reason: (existing.reason as string) || undefined,
        createdAt: String(existing.created_at),
        decidedAt: (existing.decided_at as string) || undefined,
      };
    }
    const approval: Approval = {
      id,
      kind: a.kind,
      status: "open",
      programId: a.programId,
      subject: a.subject,
      blastRadius: a.blastRadius ?? [],
      reason: a.reason,
      createdAt: new Date().toISOString(),
    };
    this.data.approvals.push({
      id: approval.id,
      kind: approval.kind,
      status: approval.status,
      program_id: approval.programId ?? null,
      subject: approval.subject,
      blast_radius: JSON.stringify(approval.blastRadius),
      reason: approval.reason ?? null,
      created_at: approval.createdAt,
      decided_at: null,
    });
    this.appendEvent({
      type: "approval.requested",
      actor: "system",
      programId: approval.programId,
      payload: { approvalId: approval.id, kind: approval.kind, subject: approval.subject },
    });
    return approval;
  }

  decideApproval(
    id: string,
    decision: "approve" | "reject" | "defer",
    reason?: string,
  ): (Approval & { channel?: { parentId?: string; replyId?: string; file?: string } }) | null {
    const row = this.data.approvals.find((r) => r.id === id);
    if (!row) return null;
    const status =
      decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "deferred";
    const decidedAt = new Date().toISOString();
    row.status = status;
    if (reason) row.reason = reason;
    row.decided_at = decidedAt;
    this.persist();
    this.appendEvent({
      type: "approval.decided",
      actor: "human",
      programId: (row.program_id as string) || undefined,
      payload: { approvalId: id, decision, reason },
    });
    const channel = this.resolveApprovalChannel(id, decision, reason);
    return {
      id: String(row.id),
      kind: row.kind as Approval["kind"],
      status: status as Approval["status"],
      programId: (row.program_id as string) || undefined,
      subject: String(row.subject),
      blastRadius: JSON.parse(String(row.blast_radius || "[]")),
      reason: reason ?? (row.reason as string) ?? undefined,
      createdAt: String(row.created_at),
      decidedAt,
      channel,
    };
  }

  listApprovals(status?: string) {
    let rows = [...this.data.approvals];
    if (status) rows = rows.filter((r) => r.status === status);
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
}
