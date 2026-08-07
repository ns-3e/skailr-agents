// DOC: route-convention discovery for the program-rbac grader. Invitation
// and role-management endpoints are entirely absent from the baseline
// fixture and the task prompt does not dictate exact paths, so the grader
// probes a short list of conventional REST shapes (consistent with the
// fixture's own existing `/orgs/:orgId/members` convention) rather than
// hard-coding one. HTTP-only, black-box.
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

export const INVITE_CREATE_CANDIDATES = (orgId) => [
  `/orgs/${orgId}/invitations`,
  `/orgs/${orgId}/invites`,
  `/orgs/${orgId}/invitations/create`,
  `/invitations`,
  `/invites`,
];

export async function discoverInviteCreate(base, orgId, token, body) {
  for (const path of INVITE_CREATE_CANDIDATES(orgId)) {
    let r;
    try {
      r = await req(base, "POST", path, { token, body });
    } catch {
      continue;
    }
    if (r.status >= 200 && r.status < 300) {
      const id = r.json?.id || r.json?.invitationId || r.json?.invitation?.id;
      const inviteToken = r.json?.token || r.json?.invitationToken || r.json?.invitation?.token;
      if (typeof id === "string") return { basePath: path, id, inviteToken, body: r.json, status: r.status };
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

const REVOKE_SHAPES = (base, id) => [
  { method: "DELETE", path: `${base}/${id}` },
  { method: "POST", path: `${base}/${id}/revoke` },
  { method: "DELETE", path: `${base}/${id}/revoke` },
  { method: "PATCH", path: `${base}/${id}`, body: { revoked: true, status: "revoked" } },
];

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

export function acceptCandidates(orgId, basePath, id, inviteToken) {
  const tok = inviteToken || id;
  return [
    { method: "POST", path: `/invitations/accept`, body: { token: tok } },
    { method: "POST", path: `/invitations/${tok}/accept`, body: {} },
    { method: "POST", path: `${basePath}/accept`, body: { token: tok } },
    { method: "POST", path: `${basePath}/${id}/accept`, body: { token: tok } },
    { method: "POST", path: `/accept-invitation`, body: { token: tok } },
    { method: "POST", path: `/orgs/${orgId}/invitations/${id}/accept`, body: { token: tok } },
  ];
}

export async function discoverAccept(base, orgId, basePath, id, inviteToken, token) {
  for (const c of acceptCandidates(orgId, basePath, id, inviteToken)) {
    let r;
    try {
      r = await req(base, c.method, c.path, { token, body: c.body });
    } catch {
      continue;
    }
    if (r.status >= 200 && r.status < 300) return { shape: c, response: r };
  }
  return null;
}

const ROLE_CHANGE_SHAPES = (orgId, userId, role) => [
  { method: "PATCH", path: `/orgs/${orgId}/members/${userId}`, body: { role } },
  { method: "POST", path: `/orgs/${orgId}/members/${userId}/role`, body: { role } },
  { method: "PUT", path: `/orgs/${orgId}/members/${userId}`, body: { role } },
];

export async function discoverRoleChange(base, orgId, userId, role, token) {
  for (const shape of ROLE_CHANGE_SHAPES(orgId, userId, role)) {
    let r;
    try {
      r = await req(base, shape.method, shape.path, { token, body: shape.body });
    } catch {
      continue;
    }
    if (r.status >= 200 && r.status < 300) return { shape, response: r };
    if (r.status === 403 || r.status === 400 || r.status === 409) return { shape, response: r, denied: true };
  }
  return null;
}

const REMOVE_SHAPES = (orgId, userId) => [{ method: "DELETE", path: `/orgs/${orgId}/members/${userId}` }];

export async function discoverMemberRemove(base, orgId, userId, token) {
  for (const shape of REMOVE_SHAPES(orgId, userId)) {
    let r;
    try {
      r = await req(base, shape.method, shape.path, { token });
    } catch {
      continue;
    }
    return { shape, response: r };
  }
  return null;
}

export { req };
