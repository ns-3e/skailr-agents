// DOC: F-010 — headless Claude Code invocation + mock/dry-run mode.
//
// REAL FLAGS — verified against `claude --help` (/opt/node22/bin/claude,
// v2.1.224) on 2026-08-07. Centralized HERE ONLY; nowhere else in the
// harness should hardcode a CLI flag name.
//
//   -p / --print                  non-interactive mode (required for headless)
//   --model <model>                exact model id (config.yaml "model")
//   --output-format stream-json    NDJSON events on stdout (assumed correct;
//                                   confirmed present in --help)
//   --verbose                      REQUIRED alongside --print
//                                   --output-format=stream-json — the CLI
//                                   rejects that combination without it
//                                   ("Error: When using --print,
//                                   --output-format=stream-json requires
//                                   --verbose"). Not documented next to
//                                   --output-format in --help; only surfaced
//                                   by actually invoking the CLI for real
//                                   (first done 2026-08-07 via
//                                   bench/docker-run.sh — every prior "real"
//                                   run silently failed at CLI launch with
//                                   termination_reason: nonzero_exit, 0
//                                   model_requests, $0 cost, before this was
//                                   added).
//   --max-budget-usd <amount>      hard $ spend cap for this invocation
//   --session-id <uuid>            pin session id for stream-json correlation
//   --dangerously-skip-permissions bypass all permission prompts — required
//                                   for unattended runs; safe here because
//                                   every invocation happens inside an
//                                   isolated, disposable per-run fixture
//                                   workspace with no other network access
//                                   than the model API (brief constraints).
//   prompt is a POSITIONAL argument, not a flag value string built by us —
//   passed as one argv element via spawn() (no shell), so no quoting/
//   injection risk regardless of prompt content.
//
// DEVIATION FROM ASSUMED FLAG SET (brief Q1 assumed `--max-turns`): **no
// `--max-turns` (or equivalent per-turn cap) flag exists in this CLI
// version's --help output.** There is no native way to ask the `claude`
// process itself to stop after N turns. Consequence: turn-count limiting is
// NOT enforced by an invocation flag; the harness's only hard controls are
// `--max-budget-usd` (spend cap, native) and the wall-clock timeout
// (SIGTERM→SIGKILL, enforced by run.mjs around this process, see
// terminationReasonFromExit below). `termination_reason: "turns"` is
// therefore a heuristic post-hoc classification (num_turns in the final
// result event reached/exceeded config max_turns), not a live-enforced cut.
// Logged to field-guide; flag architect if a hard per-turn cap becomes a
// real requirement (would need a wrapper that counts turns from the stream
// and kills the process itself).
//
// This file has NOT been exercised against a real live invocation (would
// spend real model budget; brief's mock/dry-run mode exists precisely so
// AC-1/2/4/5/6/7 are provable without that spend — see brief "Success
// Criteria" note). The real-mode code path below is therefore
// best-effort/defensive: it passes through whatever JSON lines the live
// process emits without assuming an exact event shape beyond `type` and
// (for the final line) `type:"result"`, and documents that assumption here
// rather than scattering it. Mock mode is the fully verified, tested path.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./lib/fsutil.mjs";
import { writeMockRun } from "./lib/mock.mjs";

export class ClaudeInvocationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ClaudeInvocationError";
    this.code = code;
  }
}

export function isMockMode(opts = {}) {
  return opts.mock === true || process.env.BENCH_MOCK === "1";
}

// DOC: per-arm launch-prompt construction (fixes the baseline-arm bug where a
// bare Skailr-only slash command as the literal first line of a task prompt
// made the CLI's slash-command parser intercept it before any task work
// started — "Unknown command: /patch. Did you mean /batch?" — a ~4s, $0,
// zero-tool-call run on every baseline rep). `task.prompt` (the task body) is
// arm-agnostic and stored once in task.yaml; `task.command` (e.g. "/patch")
// is the optional leading Skailr slash command, sent ONLY on the skailr arm
// so its mandated engineer-dispatch discipline still fires. The baseline arm
// gets an equivalent plain-language framing line instead of the slash
// command line, so a vanilla agent still attempts the identical task body
// fairly. This keeps the single `prompt:` field in task.yaml as the one
// authored value; the two variants are constructed here, not duplicated in
// YAML. See bench/README.md "Adding a task" + "Arms + installArm".
const BASELINE_FRAMING =
  "You are a software engineer with edit access to this repository. " +
  "Complete the following task directly and autonomously (do not ask for " +
  "confirmation), including tests, and leave the repository in a working state.";

export function buildLaunchPrompt(task, arm) {
  if (!task.command) return task.prompt;
  if (arm === "skailr") return `${task.command}\n\n${task.prompt}`;
  return `${BASELINE_FRAMING}\n\n${task.prompt}`;
}

/**
 * Classify how the process ended into the run-json termination_reason enum.
 * Heuristic where the CLI gives us no authoritative signal (see DEVIATION
 * comment above re: "turns").
 */
export function classifyTermination({ killedByTimeout, exitCode, signal, resultEvent, maxTurns }) {
  if (killedByTimeout) return "wall_clock_kill";
  if (resultEvent) {
    if (!resultEvent.is_error && resultEvent.subtype === "success") {
      if (maxTurns && resultEvent.num_turns >= maxTurns) return "turns";
      return "finish";
    }
    if (resultEvent.is_error) {
      if (resultEvent.total_cost_usd === null) return "crash";
      return "budget";
    }
  }
  if (signal) return "wall_clock_kill";
  if (exitCode !== 0 && exitCode !== null) return "nonzero_exit";
  return "crash";
}

/**
 * Invoke `claude` headlessly (or the mock generator), streaming events into
 * `<runDir>/events.jsonl`, raw stdout/stderr into `<runDir>/stdout.log` /
 * `stderr.log`, and returning the normalized result.
 *
 * @returns {Promise<{
 *   sessionId, promptId, events, resultEvent,
 *   exitCode, signal, killedByTimeout,
 *   termination_reason, wall_clock_s,
 *   eventsPath, resultPath, stdoutPath, stderrPath
 * }>}
 */
export async function invokeClaude(opts) {
  const {
    prompt,
    model,
    cwd,
    runDir,
    maxBudgetUsd,
    timeoutMs = 45 * 60 * 1000,
    env = {},
    claudeBin = "claude",
    flavor = "solved",
    maxTurns,
  } = opts;

  ensureDir(runDir);
  const sessionId = opts.sessionId || randomUUID();
  const promptId = opts.promptId || randomUUID();
  const eventsPath = path.join(runDir, "events.jsonl");
  const resultPath = path.join(runDir, "result.json");
  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");

  if (isMockMode(opts)) {
    const started = Date.now();
    const { events } = writeMockRun(runDir, { sessionId, promptId, model, flavor });
    const resultEvent = events.find((e) => e.type === "result") || null;
    fs.writeFileSync(stdoutPath, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    fs.writeFileSync(stderrPath, "", "utf8");
    if (resultEvent) fs.writeFileSync(resultPath, JSON.stringify(resultEvent, null, 2) + "\n", "utf8");
    const killedByTimeout = flavor === "timeout";
    const wall_clock_s = (Date.now() - started) / 1000;
    const termination_reason = classifyTermination({
      killedByTimeout,
      exitCode: resultEvent && resultEvent.is_error ? 1 : 0,
      signal: null,
      resultEvent,
      maxTurns,
    });
    return {
      sessionId, promptId, events, resultEvent,
      exitCode: resultEvent && resultEvent.is_error ? 1 : 0,
      signal: null, killedByTimeout,
      termination_reason, wall_clock_s,
      eventsPath, resultPath, stdoutPath, stderrPath,
    };
  }

  const args = [
    "-p", prompt,
    "--model", model,
    "--output-format", "stream-json",
    "--verbose",
    "--session-id", sessionId,
    "--dangerously-skip-permissions",
  ];
  if (maxBudgetUsd !== undefined && maxBudgetUsd !== null) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  return new Promise((resolve, reject) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(claudeBin, args, { cwd, env: { ...process.env, ...env } });
    } catch (err) {
      reject(new ClaudeInvocationError(`failed to spawn "${claudeBin}": ${err.message}`, "spawn_failed"));
      return;
    }

    const events = [];
    let stdoutBuf = "";
    const stdoutStream = fs.createWriteStream(stdoutPath);
    const stderrStream = fs.createWriteStream(stderrPath);
    const eventsStream = fs.createWriteStream(eventsPath);

    let killedByTimeout = false;
    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already dead */ }
      }, 5000).unref();
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdoutStream.write(text);
      stdoutBuf += text;
      let idx;
      while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          events.push(obj);
          eventsStream.write(JSON.stringify(obj) + "\n");
        } catch {
          // Non-JSON stdout line — real CLI output shape not fully verified
          // live (see top-of-file DEVIATION note); preserved in stdout.log
          // only, not treated as a fatal parse error.
        }
      }
    });
    child.stderr.on("data", (chunk) => stderrStream.write(chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      stdoutStream.end(); stderrStream.end(); eventsStream.end();
      reject(new ClaudeInvocationError(`claude process error: ${err.message}`, "process_error"));
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      stdoutStream.end(); stderrStream.end(); eventsStream.end();
      const resultEvent = events.find((e) => e.type === "result") || null;
      if (resultEvent) fs.writeFileSync(resultPath, JSON.stringify(resultEvent, null, 2) + "\n", "utf8");
      const wall_clock_s = (Date.now() - started) / 1000;
      const termination_reason = classifyTermination({
        killedByTimeout, exitCode, signal, resultEvent, maxTurns,
      });
      resolve({
        sessionId, promptId, events, resultEvent,
        exitCode, signal, killedByTimeout,
        termination_reason, wall_clock_s,
        eventsPath, resultPath, stdoutPath, stderrPath,
      });
    });
  });
}
