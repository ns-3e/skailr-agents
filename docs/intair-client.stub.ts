/** Stub Intair client interface — real transport lives in the Intair repo. */

export type IntairOntologyId = string;

export interface IntairQueryRequest {
  ontologyId: IntairOntologyId;
  query: string;
  limit?: number;
}

export interface IntairProposeSchemaChangeRequest {
  ontologyId: IntairOntologyId;
  proposal: Record<string, unknown>;
  complianceTagged?: boolean;
}

export interface IntairSpawnTempRequest {
  purpose: string;
  seedFrom?: IntairOntologyId;
}

export interface IntairMergeFindingsRequest {
  tempOntologyId: IntairOntologyId;
  targetOntologyId: IntairOntologyId;
  findingIds: string[];
}

export interface IntairClient {
  query(req: IntairQueryRequest): Promise<{ results: unknown[] }>;
  proposeSchemaChange(
    req: IntairProposeSchemaChangeRequest,
  ): Promise<{ proposalId: string; requiresSkailrApproval: true }>;
  spawnTemp(req: IntairSpawnTempRequest): Promise<{ ontologyId: IntairOntologyId }>;
  mergeFindings(
    req: IntairMergeFindingsRequest,
  ): Promise<{ mergeId: string; requiresSkailrApproval: true }>;
  /** Apply only after a human channel decision / approval for the matching id. */
  applyAfterApproval(opts: {
    changeId: string;
    skailrApprovalEventId: string;
  }): Promise<{ applied: boolean }>;
}

/** No-op stub for local wiring / tests. */
export class StubIntairClient implements IntairClient {
  async query(): Promise<{ results: unknown[] }> {
    return { results: [] };
  }
  async proposeSchemaChange(): Promise<{ proposalId: string; requiresSkailrApproval: true }> {
    return { proposalId: "stub-proposal", requiresSkailrApproval: true };
  }
  async spawnTemp(): Promise<{ ontologyId: IntairOntologyId }> {
    return { ontologyId: "temp-stub" };
  }
  async mergeFindings(): Promise<{ mergeId: string; requiresSkailrApproval: true }> {
    return { mergeId: "stub-merge", requiresSkailrApproval: true };
  }
  async applyAfterApproval(): Promise<{ applied: boolean }> {
    return { applied: false };
  }
}
