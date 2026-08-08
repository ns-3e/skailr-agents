#!/usr/bin/env node
// DOC: UserPromptSubmit hook — a cheap, deterministic first pass at the
// route-intake chooser table (CLAUDE.md / skill route-intake), injected as
// additionalContext BEFORE the model starts reasoning about the prompt.
//
// Why this exists: a live campaign this session showed CLAUDE.md's own
// chooser table does not reliably get applied by the model on a plain,
// non-slash-command prompt — agents_spawned stayed 0 across 3/3 real runs
// even though each prompt was build-shaped. That's the documented
// "compliance gap" for passive process instructions late/static in context
// (arXiv 2605.01771) — the fix is injecting a fresh, per-turn directive
// instead of relying on the model to independently rediscover and apply a
// static routing table on its own.
//
// This hook is advisory ONLY — never decision:"block". A wrong route
// suggestion should be easy for the model (or a human) to override; hard-
// blocking a valid prompt on an imperfect heuristic would be worse than the
// problem it fixes. It approximates route-intake's chooser table; it does
// not replace skill route-intake's full nuance (expert-band matching,
// resume detection edge cases) — see CLAUDE.md for the authoritative rules.
import fs from "node:fs";
import path from "node:path";

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const SLASH_COMMAND_RE = /^\s*\/[a-z][a-z-]*\b/i;

const RESEARCH_RE =
  /^\s*(what|why|how|where|when|who|which|explain|describe|is there|does|can you explain|walk me through|tell me about)\b/i;
const CHANGE_VERB_RE = /\b(add|build|implement|create|fix|refactor|write|make|change|patch|update|migrate)\b/i;

const MAP_REPO_RE = /\b(map|onboard|brownfield|audit (this|the) repo|baseline|orient(ation)? (of|for) (this|the) repo)\b/i;

const PATCH_RE = /\b(fix|bug|typo|small change|tweak|rename|hotfix|quick fix|one[- ]line|single file)\b/i;

const WHOLE_APP_RE =
  /\b(whole app|entire app|full (app|platform|product)|mvp|from scratch|multiple subsystems|end[- ]to[- ]end product|greenfield)\b/i;

function countSeparableCapabilities(text) {
  // Crude proxy for route-intake's "3+ separable capabilities" tie-breaker:
  // count bullet-like/enumerated clauses and top-level "and" joins.
  const bullets = (text.match(/^\s*[-*\d]+[.)]\s+/gm) || []).length;
  const ands = (text.match(/\band\b/gi) || []).length;
  return Math.max(bullets, ands >= 2 ? ands : 0);
}

function classify(prompt) {
  const text = prompt.trim();
  if (!text) return null;

  if (RESEARCH_RE.test(text) && !CHANGE_VERB_RE.test(text)) {
    return { route: "researcher ask mode (no slash command)", why: "reads as a question, not a change request" };
  }
  if (MAP_REPO_RE.test(text)) {
    return { route: "/map-repo", why: "reads as a brownfield baseline/onboarding ask" };
  }
  if (WHOLE_APP_RE.test(text) || countSeparableCapabilities(text) >= 3) {
    return { route: "/yolo-program", why: "reads as whole-app/MVP scope or 3+ separable capabilities phrased as one ask" };
  }
  if (PATCH_RE.test(text)) {
    return { route: "/patch", why: "reads as a small, localized change" };
  }
  if (CHANGE_VERB_RE.test(text)) {
    return { route: "/yolo", why: "reads as one cohesive feature/capability" };
  }
  return null;
}

function looksLikeResume(text, cwd) {
  const short = text.trim().length < 40 && /\b(continue|resume|keep going|pick up)\b/i.test(text.trim() || "continue");
  if (!short) return false;
  const incomplete = [".claude/tmp/progress.md", ".claude/program/ledger.md", ".claude/repo/progress.md"].some((p) => {
    const full = path.join(cwd, p);
    if (!fs.existsSync(full)) return false;
    try {
      const t = fs.readFileSync(full, "utf8");
      return /status:\s*(in_progress|building|draft)/i.test(t) || !/status:\s*complete/i.test(t);
    } catch {
      return false;
    }
  });
  return incomplete;
}

const input = readStdinJson();
const prompt = input.user_input || "";
const cwd = input.cwd || process.cwd();

if (!prompt.trim() || SLASH_COMMAND_RE.test(prompt)) {
  process.exit(0); // already explicit, or empty — nothing to route
}

if (looksLikeResume(prompt, cwd)) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "route-prompt: an incomplete progress/ledger file exists and this looks like a resume ask — per CLAUDE.md hard rule 2, route to /continue-feature, /continue-program, or re-enter /yolo(-program) with no new prompt, not a fresh /patch.",
      },
    })
  );
  process.exit(0);
}

const result = classify(prompt);
if (!result) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        `route-prompt (heuristic, non-authoritative — see CLAUDE.md route-intake for the real chooser table): ` +
        `this ask ${result.why}, which suggests ${result.route}. If a slash command isn't already driving this turn, ` +
        `consider explicitly executing that command rather than answering inline — a prior campaign found plain-prompt ` +
        `self-routing does not reliably happen without this nudge.`,
    },
  })
);
process.exit(0);
