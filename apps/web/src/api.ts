const API = import.meta.env.VITE_SKAILR_API || "/api";

function token() {
  return localStorage.getItem("skailr_token") || "";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
