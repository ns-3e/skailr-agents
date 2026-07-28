import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { SkailrStore } from "./store.js";
import { createApp } from "./app.js";
import { importProgramDir } from "./sync.js";

const port = Number(process.env.SKAILR_PORT || 8787);
const dbPath = process.env.SKAILR_DB || resolve(".skailr/skailr.json");
const token = process.env.SKAILR_TOKEN;
const programDir = process.env.SKAILR_PROGRAM_DIR || resolve(".claude/program");

const store = new SkailrStore({ path: dbPath });
try {
  importProgramDir(store, programDir, "default");
} catch {
  // empty workspace is fine
}

const app = createApp(store, { token, programDir });
serve({ fetch: app.fetch, port }, () => {
  console.log(`skailr-server listening on http://127.0.0.1:${port}`);
});
