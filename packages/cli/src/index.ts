#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import {
  SkailrStore,
  createApp,
  importProgramDir,
  exportLedgerStub,
  injectUiBootstrap,
  seedDemoProgram,
} from "@skailr/server";

// Tolerate pasted prose like `skailr serve,` or `skailr serve.`
process.argv = process.argv.map((arg, i) =>
  i >= 2 ? arg.replace(/[,.;:]+$/g, "") : arg,
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

function runScript(name: string, args: string[] = []) {
  const script = resolve(repoRoot, "scripts/skailr", name);
  const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

async function api(
  path: string,
  init?: RequestInit & { base?: string },
) {
  const base = init?.base || process.env.SKAILR_URL || "http://127.0.0.1:8787";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (process.env.SKAILR_TOKEN) {
    headers.authorization = `Bearer ${process.env.SKAILR_TOKEN}`;
  } else if (existsSync(".skailr/config.json")) {
    try {
      const t = JSON.parse(readFileSync(".skailr/config.json", "utf8")).token;
      if (t) headers.authorization = `Bearer ${t}`;
    } catch {
      /* ignore */
    }
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

const main = defineCommand({
  meta: { name: "skailr", description: "Skailr control plane CLI" },
  subCommands: {
    init: defineCommand({
      meta: { description: "Initialize .skailr + ensure program dirs" },
      async run() {
        mkdirSync(".skailr", { recursive: true });
        mkdirSync(".claude/program/channels", { recursive: true });
        mkdirSync(".claude/tmp", { recursive: true });
        const token = randomUUID().replace(/-/g, "");
        writeFileSync(".skailr/config.json", JSON.stringify({ token, port: 8787 }, null, 2));
        console.log("Initialized .skailr/config.json");
        console.log("Install the agent pack with ./install.sh . from the skailr-agents repo if needed.");
      },
    }),
    status: defineCommand({
      meta: { description: "Show ledger status / next phase" },
      async run() {
        runScript("ledger-status.mjs");
      },
    }),
    continue: defineCommand({
      meta: { description: "Print resume guidance from ledger" },
      async run() {
        runScript("ledger-status.mjs", ["--json"]);
      },
    }),
    serve: defineCommand({
      meta: { description: "Start API server (+ optional static web dist)" },
      args: {
        port: { type: "string", default: "8787" },
        db: { type: "string", default: ".skailr/skailr.json" },
      },
      async run({ args }) {
        mkdirSync(dirname(resolve(String(args.db))), { recursive: true });
        const store = new SkailrStore({ path: resolve(String(args.db)) });
        const programDir = resolve(".claude/program");
        const hasRealProgram = existsSync(join(programDir, "ledger.md"));
        if (hasRealProgram) {
          importProgramDir(store, programDir, "default");
        }
        const demoDir = resolve(repoRoot, "examples/parallel-api");
        const seed = seedDemoProgram(store, demoDir);
        if (seed.seeded) {
          console.log(`Demo seed: ${seed.reason}`);
        } else if (!hasRealProgram) {
          console.log(`Demo seed skipped: ${seed.reason}`);
        }
        let token: string | undefined;
        if (existsSync(".skailr/config.json")) {
          token = JSON.parse(readFileSync(".skailr/config.json", "utf8")).token;
        }
        const app = createApp(store, { token, programDir });
        const webDist = resolve(repoRoot, "apps/web/dist");
        if (existsSync(webDist)) {
          app.get("/", async (c) => {
            let html = readFileSync(join(webDist, "index.html"), "utf8");
            html = injectUiBootstrap(html, token);
            return c.html(html);
          });
          app.get("/assets/:name", async (c) => {
            const name = c.req.param("name");
            const file = join(webDist, "assets", name);
            if (!existsSync(file)) return c.notFound();
            const body = readFileSync(file);
            const type = name.endsWith(".css")
              ? "text/css"
              : name.endsWith(".js")
                ? "application/javascript"
                : "application/octet-stream";
            return new Response(body, { headers: { "content-type": type } });
          });
        } else {
          app.get("/", (c) =>
            c.html(
              `<!doctype html><meta charset="utf-8"><title>Skailr</title>
               <body style="font-family:system-ui;padding:2rem">
               <h1>Skailr API</h1>
               <p>UI build not found. Run <code>npm run build -w @skailr/web</code>.</p>
               <p>Health: <a href="/health">/health</a></p>
               </body>`,
            ),
          );
        }
        const port = Number(args.port);
        serve({ fetch: app.fetch, port }, () => {
          const base = `http://127.0.0.1:${port}`;
          console.log(`skailr serve ${base}`);
          if (token) {
            console.log(`Open UI:  ${base}/?token=${token}`);
            console.log(`(token also auto-injected when you load ${base}/)`);
          }
        });
      },
    }),
    sync: defineCommand({
      meta: { description: "Sync markdown program state with the store via API or local" },
      subCommands: {
        import: defineCommand({
          meta: { description: "Import .claude/program into store" },
          args: {
            demo: {
              type: "boolean",
              default: false,
              description: "Seed examples/parallel-api (force)",
            },
          },
          async run({ args }) {
            if (args.demo) {
              mkdirSync(".skailr", { recursive: true });
              const store = new SkailrStore({ path: resolve(".skailr/skailr.json") });
              const demoDir = resolve(repoRoot, "examples/parallel-api");
              const seed = seedDemoProgram(store, demoDir, { force: true });
              console.log(seed.seeded ? `Demo seed: ${seed.reason}` : `Skip: ${seed.reason}`);
              // Also push to running server if up
              await api("/sync/import", {
                method: "POST",
                body: JSON.stringify({ dir: demoDir, programId: "parallel-api" }),
              }).catch(() => ({ status: 0, body: null }));
              return;
            }
            const r = await api("/sync/import", { method: "POST", body: "{}" });
            if (r.status >= 400) {
              mkdirSync(".skailr", { recursive: true });
              const store = new SkailrStore({ path: resolve(".skailr/skailr.json") });
              importProgramDir(store, resolve(".claude/program"), "default");
              const demoDir = resolve(repoRoot, "examples/parallel-api");
              const seed = seedDemoProgram(store, demoDir);
              if (seed.seeded) console.log(`Demo seed: ${seed.reason}`);
              console.log("Imported locally into .skailr/skailr.json");
              return;
            }
            console.log(JSON.stringify(r.body, null, 2));
          },
        }),
        export: defineCommand({
          meta: { description: "Export ledger stub from store" },
          async run() {
            const r = await api("/sync/export", { method: "POST", body: "{}" });
            if (r.status >= 400) {
              const store = new SkailrStore({ path: resolve(".skailr/skailr.json") });
              exportLedgerStub(store, "default", resolve(".claude/program/ledger.md"));
              console.log("Exported ledger locally");
              return;
            }
            console.log(JSON.stringify(r.body, null, 2));
          },
        }),
      },
    }),
    inbox: defineCommand({
      meta: { description: "Exception inbox" },
      subCommands: {
        list: defineCommand({
          meta: { description: "List open inbox items" },
          async run() {
            const r = await api("/inbox");
            if (r.status >= 400) {
              runScript("validate-channels.mjs");
              return;
            }
            console.log(JSON.stringify(r.body, null, 2));
          },
        }),
        show: defineCommand({
          meta: { description: "Show one approval/message id" },
          args: { id: { type: "positional", required: true } },
          async run({ args }) {
            const r = await api("/inbox");
            const body = r.body as {
              approvals?: Array<{ id: string }>;
              channel?: Array<{ id: string }>;
            };
            const hit =
              body.approvals?.find((a) => a.id === args.id) ||
              body.channel?.find((a) => a.id === args.id);
            console.log(JSON.stringify(hit || { error: "not_found" }, null, 2));
          },
        }),
      },
    }),
    approve: defineCommand({
      meta: { description: "Approve an inbox approval id" },
      args: {
        id: { type: "positional", required: true },
        reason: { type: "string", default: "" },
      },
      async run({ args }) {
        const r = await api(`/approvals/${args.id}`, {
          method: "POST",
          body: JSON.stringify({ decision: "approve", reason: args.reason || undefined }),
        });
        console.log(JSON.stringify(r.body, null, 2));
        process.exit(r.status >= 400 ? 1 : 0);
      },
    }),
    reject: defineCommand({
      meta: { description: "Reject an inbox approval id" },
      args: {
        id: { type: "positional", required: true },
        reason: { type: "string", default: "" },
      },
      async run({ args }) {
        const r = await api(`/approvals/${args.id}`, {
          method: "POST",
          body: JSON.stringify({ decision: "reject", reason: args.reason || undefined }),
        });
        console.log(JSON.stringify(r.body, null, 2));
        process.exit(r.status >= 400 ? 1 : 0);
      },
    }),
    ownership: defineCommand({
      meta: { description: "Ownership checks" },
      subCommands: {
        check: defineCommand({
          meta: { description: "Run ownership script" },
          async run() {
            runScript("check-ownership.mjs");
          },
        }),
      },
    }),
    contracts: defineCommand({
      meta: { description: "Contract checks" },
      subCommands: {
        check: defineCommand({
          meta: { description: "Run contracts script" },
          async run() {
            runScript("check-contracts.mjs");
          },
        }),
      },
    }),
    stubs: defineCommand({
      meta: { description: "Stub emission" },
      subCommands: {
        emit: defineCommand({
          meta: { description: "Emit stubs from contract sidecars" },
          async run() {
            runScript("emit-stubs.mjs");
          },
        }),
      },
    }),
    program: defineCommand({
      meta: { description: "Program helpers" },
      subCommands: {
        status: defineCommand({
          meta: { description: "Alias of status" },
          async run() {
            runScript("ledger-status.mjs");
          },
        }),
        start: defineCommand({
          meta: { description: "Remind to use /build-program in Claude/Cursor" },
          async run() {
            console.log(
              "Start or resume the program in Claude Code / Cursor with /build-program or /continue-program.",
            );
            runScript("ledger-status.mjs");
          },
        }),
      },
    }),
  },
});

runMain(main);
