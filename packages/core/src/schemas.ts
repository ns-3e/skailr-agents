import { z } from "zod";

export const ContractStatus = z.enum(["draft", "frozen", "superseded"]);
export const ContractKind = z.enum([
  "api",
  "schema",
  "event",
  "content",
  "compliance",
  "delivery",
]);

export const ContractFrontmatterSchema = z.object({
  schema: z.literal("skailr.contract/v1"),
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  status: ContractStatus,
  producers: z.array(z.string()).default([]),
  consumers: z.array(z.string()).default([]),
  kind: ContractKind.default("api"),
  supersedes: z.union([z.string(), z.null()]).optional(),
});

export type ContractFrontmatter = z.infer<typeof ContractFrontmatterSchema>;

export const ProgramStatus = z.enum([
  "planning",
  "approved",
  "building",
  "integrating",
  "validating",
  "documenting",
  "complete",
  "blocked",
]);

export const PhaseStatus = z.enum(["pending", "in_progress", "complete", "blocked"]);

export const LedgerFrontmatterSchema = z.object({
  schema: z.literal("skailr.ledger/v1"),
  program: z.string().min(1),
  status: ProgramStatus,
  updated: z.string().optional(),
});

export type LedgerFrontmatter = z.infer<typeof LedgerFrontmatterSchema>;

export const OwnershipOwnerSchema = z.object({
  id: z.string(),
  team: z.string(),
  workstream: z.string().optional(),
  units: z.array(z.string()).min(1),
});

export const OwnershipMapSchema = z.object({
  schema: z.literal("skailr.ownership/v1"),
  baseRef: z.string().optional(),
  kernel: z
    .object({
      globs: z.array(z.string()).default([]),
      frozen: z.boolean().default(false),
    })
    .optional(),
  owners: z.array(OwnershipOwnerSchema).min(1),
});

export type OwnershipMap = z.infer<typeof OwnershipMapSchema>;

export const ChannelMessageType = z.enum([
  "question",
  "answer",
  "decision",
  "heads-up",
  "blocker",
  "contract-change",
  "ack",
]);

export const ChannelMessageStatus = z.enum([
  "open",
  "answered",
  "resolved",
  "blocked-on-human",
]);

export const ChannelMessageSchema = z.object({
  id: z.string().regex(/^MSG-\d+$/),
  from: z.string(),
  to: z.string(),
  type: ChannelMessageType,
  re: z.string().optional(),
  status: ChannelMessageStatus,
  body: z.string(),
});

export type ChannelMessage = z.infer<typeof ChannelMessageSchema>;

export const EventType = z.enum([
  "program.created",
  "brief.confirmed",
  "plan.approved",
  "contract.frozen",
  "contract.changed",
  "phase.advanced",
  "channel.posted",
  "approval.requested",
  "approval.decided",
  "workstream.completed",
  "integration.completed",
  "validation.completed",
  "inbox.escalated",
]);

export const SkailrEventSchema = z.object({
  id: z.string(),
  type: EventType,
  ts: z.string(),
  actor: z.string(),
  programId: z.string().optional(),
  initiativeId: z.string().optional(),
  correlationId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

export type SkailrEvent = z.infer<typeof SkailrEventSchema>;

export const ApprovalDecision = z.enum(["approve", "reject", "defer"]);

export const ApprovalSchema = z.object({
  id: z.string(),
  kind: z.enum(["story", "spec", "plan", "contract", "release", "human"]),
  status: z.enum(["open", "approved", "rejected", "deferred"]),
  programId: z.string().optional(),
  subject: z.string(),
  blastRadius: z.array(z.string()).default([]),
  reason: z.string().optional(),
  createdAt: z.string(),
  decidedAt: z.string().optional(),
});

export type Approval = z.infer<typeof ApprovalSchema>;
