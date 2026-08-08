// DOC: route-convention discovery for the feature-api-keys grader. The task
// prompt deliberately does not dictate exact endpoint paths (the API-key
// feature is entirely missing from the fixture), so the grader probes a
// short list of conventional REST shapes rather than hard-coding one. Only
// used against the workspace's own HTTP surface (black-box over loopback).
export const CREATE_CANDIDATES = [
  "/api-keys",
  "/api_keys",
  "/apikeys",
  "/keys",
  "/org/api-keys",
  "/orgs/api-keys",
  "/organizations/api-keys",
];

const REVOKE_SHAPES = (base, id) => [
  { method: "DELETE", path: `${base}/${id}` },
  { method: "POST", path: `${base}/${id}/revoke` },
  { method: "DELETE", path: `${base}/${id}/revoke` },
  { method: "PATCH", path: `${base}/${id}`, body: { revoked: true } },
  { method: "PUT", path: `${base}/${id}`, body: { revoked: true } },
  { method: "POST", path: `${base}/revoke`, body: { id } },
];

async function req(base, method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : method === "POST" ? "{}" : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text };
}

// Searches `json` for a string field matching `nameRe`, preferring shallower
// matches: every key at the current depth is checked before descending into
// any nested object/array. This tolerates response envelopes that group
// fields under a named object (e.g. `{ key, api_key: { id, ... } }`) instead
// of putting everything at the top level — both are valid API designs and
// the grader must not assume one over the other. Bounded depth + cycle guard
// (mirrors the read-only db scan in hidden-tests.mjs) so a pathological or
// self-referential body can't hang the probe.
function extractField(json, nameRe, { excludeNameRe, minLen = 12, maxDepth = 4 } = {}) {
  const seen = new Set();
  function walk(obj, depth) {
    if (!obj || typeof obj !== "object" || depth > maxDepth || seen.has(obj)) return undefined;
    seen.add(obj);
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "string") continue;
      if (excludeNameRe && excludeNameRe.test(k)) continue;
      if (nameRe.test(k) && v.length >= minLen) return v;
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") {
        const found = walk(v, depth + 1);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }
  return walk(json, 0);
}

/** Tries each CREATE_CANDIDATES base path; returns the first that yields a
 * plausible {basePath, id, rawKey} triple, or null. */
export async function discoverCreate(base, token, name = "grader-probe-key") {
  for (const path of CREATE_CANDIDATES) {
    let r;
    try {
      r = await req(base, "POST", path, { token, body: { name } });
    } catch {
      continue;
    }
    if (r.status < 200 || r.status >= 300) continue;
    const id = extractField(r.json, /^(id|key_?id|api_?key_?id)$/i, { minLen: 1 }) || r.json?.id;
    const rawKey =
      extractField(r.json, /^(api_?key|key)$/i) ||
      extractField(r.json, /key/i, { excludeNameRe: /id/i }) ||
      extractField(r.json, /^(secret|token)$/i);
    if (typeof id === "string" && typeof rawKey === "string" && rawKey !== id) {
      return { basePath: path, id, rawKey, createStatus: r.status, createBody: r.json };
    }
  }
  return null;
}

export async function list(base, path, token) {
  return req(base, "GET", path, { token });
}

export async function getById(base, path, id, token) {
  return req(base, "GET", `${path}/${id}`, { token });
}

export async function create(base, path, token, body) {
  return req(base, "POST", path, { token, body });
}

/** Tries each revoke shape until one 2xx's; returns the shape used or null. */
export async function discoverRevoke(base, path, id, token) {
  for (const shape of REVOKE_SHAPES(path, id)) {
    let r;
    try {
      r = await req(base, shape.method, shape.path, { token, body: shape.body });
    } catch {
      continue;
    }
    if (r.status >= 200 && r.status < 300) return { shape, response: r };
  }
  return null;
}

export { req, extractField };
