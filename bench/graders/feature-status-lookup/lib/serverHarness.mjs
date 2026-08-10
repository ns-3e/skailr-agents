// DOC: black-box harness for feature-status-lookup grader — spawns the frozen
// workspace's own `node src/server.ts` as a child process and talks to it
// only over HTTP (never imports workspace code in-process). Isolation: this
// file lives under bench/graders/feature-status-lookup, never inside the
// workspace.
import { spawn } from "node:child_process";
import net from "node:net";

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Starts `node src/server.ts` (Node 22 native TS stripping) inside
 * `workspaceDir` on `port`. Resolves once the server answers HTTP, or
 * rejects with a startup diagnostic after `timeoutMs`.
 */
export async function startServer(workspaceDir, port, { timeoutMs = 15000 } = {}) {
  const child = spawn(process.execPath, ["src/server.ts"], {
    cwd: workspaceDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let stdout = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.stdout.on("data", (d) => (stdout += d.toString()));
  let exited = false;
  let exitInfo = null;
  child.on("exit", (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `server exited early (code=${exitInfo?.code} signal=${exitInfo?.signal}) stderr: ${stderr.slice(0, 2000)}`
      );
    }
    try {
      const res = await fetch(`${base}/webhooks`, { method: "GET" });
      // Any HTTP response (even 404/405) means the listener is up.
      await res.text();
      return { child, base, stderr: () => stderr, stdout: () => stdout };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    /* noop */
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms; stderr: ${stderr.slice(0, 2000)}`);
}

export function stopServer(handle) {
  if (!handle?.child) return;
  try {
    handle.child.kill("SIGKILL");
  } catch {
    /* noop */
  }
}
