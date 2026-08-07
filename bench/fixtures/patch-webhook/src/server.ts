// DOC: Public entrypoint. POST /webhooks {event_id, amount, currency} -> 200
// { event_id, status: "processed"|"duplicate", result }. See PUBLIC_API.md
// for the full contract. No auth (fixture scope): webhook signature
// verification is out of scope for this benchmark task.
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { processEvent, type WebhookEvent } from "./ledger.ts";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function isValidEvent(value: unknown): value is WebhookEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.event_id === "string" &&
    v.event_id.length > 0 &&
    typeof v.amount === "number" &&
    typeof v.currency === "string"
  );
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST" || req.url !== "/webhooks") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    sendJson(res, 400, { error: "invalid_body" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  if (!isValidEvent(parsed)) {
    sendJson(res, 400, { error: "invalid_event", detail: "event_id, amount, currency are required" });
    return;
  }

  const outcome = await processEvent(parsed);
  sendJson(res, 200, outcome);
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "internal_error" });
    });
  });
}

// Allow running directly: `node src/server.ts`.
const isMain = process.argv[1] && process.argv[1].endsWith("server.ts");
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`patch-webhook fixture listening on :${port}`);
  });
}
