import { minimatch } from "minimatch";
import type { OwnershipMap } from "./schemas.js";

export function pathMatchesAny(path: string, globs: string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  return globs.some((g) => minimatch(normalized, g, { dot: true }));
}

export function findOwnerCollisions(map: OwnershipMap): string[] {
  const errors: string[] = [];
  const owners = map.owners;
  for (let i = 0; i < owners.length; i++) {
    for (let j = i + 1; j < owners.length; j++) {
      const a = owners[i]!;
      const b = owners[j]!;
      for (const ga of a.units) {
        for (const gb of b.units) {
          if (ga === gb || minimatch(ga, gb, { dot: true }) || minimatch(gb, ga, { dot: true })) {
            errors.push(
              `Ownership overlap: ${a.id} (${ga}) vs ${b.id} (${gb})`,
            );
          }
        }
      }
    }
  }
  return errors;
}

export type OwnershipViolation = {
  path: string;
  reason: "unowned" | "collision" | "kernel_violation" | "wrong_owner";
  owners: string[];
};

export function checkDiffAgainstOwnership(
  paths: string[],
  map: OwnershipMap,
  opts?: { actorOwnerId?: string },
): OwnershipViolation[] {
  const violations: OwnershipViolation[] = [];
  const kernelGlobs = map.kernel?.globs ?? [];
  const kernelFrozen = map.kernel?.frozen ?? false;

  for (const raw of paths) {
    const path = raw.replace(/\\/g, "/");
    if (!path || path.startsWith(".claude/")) continue;

    const matching = map.owners.filter((o) => pathMatchesAny(path, o.units));

    if (kernelFrozen && pathMatchesAny(path, kernelGlobs)) {
      if (!opts?.actorOwnerId || opts.actorOwnerId !== "kernel") {
        violations.push({
          path,
          reason: "kernel_violation",
          owners: matching.map((m) => m.id),
        });
        continue;
      }
    }

    if (matching.length === 0 && kernelGlobs.length && pathMatchesAny(path, kernelGlobs)) {
      continue;
    }

    if (matching.length === 0) {
      violations.push({ path, reason: "unowned", owners: [] });
      continue;
    }
    if (matching.length > 1) {
      violations.push({
        path,
        reason: "collision",
        owners: matching.map((m) => m.id),
      });
      continue;
    }
    if (opts?.actorOwnerId && matching[0]!.id !== opts.actorOwnerId) {
      violations.push({
        path,
        reason: "wrong_owner",
        owners: [matching[0]!.id],
      });
    }
  }
  return violations;
}
