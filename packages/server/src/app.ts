import { Hono } from "hono";
import { cors } from "hono/cors";
import type { SkailrStore } from "./store.js";
import { exportLedgerStub, importProgramDir, seedDemoProgram } from "./sync.js";

function isPublicPath(path: string): boolean {
  if (path === "/" || path === "/health" || path === "/favicon.ico") return true;
  if (path.startsWith("/assets/")) return true;
  if (path === "/auth/session") return true;
  return false;
}

function authorized(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }, token?: string): boolean {
  if (!token) return true;
  const auth = c.req.header("authorization") || "";
  if (auth === `Bearer ${token}`) return true;
  if (c.req.header("x-skailr-token") === token) return true;
  if (c.req.query("token") === token) return true;
  return false;
}

function registerApi(api: Hono, store: SkailrStore, opts?: { token?: string; programDir?: string }) {
  api.get("/health", (c) => c.json({ ok: true, service: "skailr-server" }));

  api.get("/inbox", (c) => {
    const channel = store.inbox();
    const approvals = store.listApprovals("open");
    return c.json({ channel, approvals });
  });

  api.get("/portfolio", (c) => {
    return c.json({
      initiatives: store.listInitiatives(),
      programs: store.listPrograms(),
    });
  });

  api.get("/programs/:id/lineage", (c) => {
    const id = c.req.param("id");
    const type = c.req.query("type") || undefined;
    return c.json({ events: store.listEvents({ programId: id, type }) });
  });

  api.get("/contracts", (c) => {
    const programId = c.req.query("programId") || undefined;
    return c.json({ contracts: store.listContracts(programId) });
  });

  api.get("/approvals", (c) => {
    const status = c.req.query("status") || undefined;
    return c.json({ approvals: store.listApprovals(status) });
  });

  api.post("/approvals/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ decision: "approve" | "reject" | "defer"; reason?: string }>();
    const updated = store.decideApproval(id, body.decision, body.reason);
    if (!updated) return c.json({ error: "not_found" }, 404);
    if (opts?.programDir && updated.programId) {
      exportLedgerStub(store, updated.programId, `${opts.programDir}/ledger.md`);
    }
    return c.json({ approval: updated });
  });

  api.post("/sync/import", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      dir?: string;
      programId?: string;
      demo?: boolean;
    };
    if (body.demo) {
      const demoDir = body.dir || "examples/parallel-api";
      const result = seedDemoProgram(store, demoDir, { force: true });
      return c.json({ ok: true, ...result, dir: demoDir });
    }
    const dir = body.dir || opts?.programDir || ".claude/program";
    const programId = body.programId || "default";
    importProgramDir(store, dir, programId);
    return c.json({ ok: true, dir, programId });
  });

  api.post("/sync/export", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      programId?: string;
      out?: string;
    };
    const programId = body.programId || "default";
    const out = body.out || `${opts?.programDir || ".claude/program"}/ledger.md`;
    exportLedgerStub(store, programId, out);
    return c.json({ ok: true, out });
  });

  /** Browser bootstrap: validate token and return it for localStorage. */
  api.get("/auth/session", (c) => {
    if (!opts?.token) return c.json({ token: null, authRequired: false });
    if (!authorized(c, opts.token)) return c.json({ error: "unauthorized" }, 401);
    return c.json({ token: opts.token, authRequired: true });
  });
}

export function createApp(store: SkailrStore, opts?: { token?: string; programDir?: string }) {
  const app = new Hono();
  app.use("*", cors());

  app.use("*", async (c, next) => {
    if (isPublicPath(c.req.path)) return next();
    // /auth/session may carry ?token=
    if (c.req.path === "/auth/session" || c.req.path === "/api/auth/session") return next();
    if (!opts?.token) return next();
    if (!authorized(c, opts.token)) {
      return c.json(
        {
          error: "unauthorized",
          hint: "Open the URL printed by `skailr serve`, or set localStorage.skailr_token from .skailr/config.json",
        },
        401,
      );
    }
    return next();
  });

  registerApi(app, store, opts);

  // Same routes under /api for the web UI (Vite proxy + production fetch prefix)
  const api = new Hono();
  registerApi(api, store, opts);
  app.route("/api", api);

  return app;
}

/** Inject local session bootstrap into built index.html */
export function injectUiBootstrap(html: string, token?: string): string {
  const script = `<script>
(function(){
  var t=${JSON.stringify(token || "")};
  if(t){ try{ localStorage.setItem("skailr_token", t); }catch(e){} }
  var q=new URLSearchParams(location.search).get("token");
  if(q){ try{ localStorage.setItem("skailr_token", q); }catch(e){}
    history.replaceState({}, "", location.pathname); }
})();
</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${script}</head>`);
  return script + html;
}
