// DOC: Audit log package (existing, working). Any privileged mutation
// (membership/role/invitation changes, etc.) should append one AuditEvent
// here. `action` is a short machine-readable verb, e.g. "org.member.role_changed".
import { randomUUID } from "node:crypto";

export interface AuditEvent {
  id: string;
  orgId: string;
  actorUserId: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
}

const events: AuditEvent[] = [];

export function logEvent(input: {
  orgId: string;
  actorUserId: string;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown>;
}): AuditEvent {
  const event: AuditEvent = {
    id: randomUUID(),
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: input.action,
    target: input.target ?? null,
    metadata: input.metadata ?? {},
    createdAt: Date.now(),
  };
  events.push(event);
  return event;
}

export function listEvents(orgId: string): AuditEvent[] {
  return events.filter((e) => e.orgId === orgId);
}

// Test-only helper.
export function __resetAuditForTests(): void {
  events.length = 0;
}
