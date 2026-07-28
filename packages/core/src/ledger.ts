export function parseFrontmatter(text: string): {
  data: Record<string, unknown>;
  body: string;
} {
  if (!text.startsWith("---")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: text };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n/, "");
  const data: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value: unknown = line.slice(idx + 1).trim();
    if (value === "null") value = null;
    else if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (/^\d+$/.test(String(value))) value = Number(value);
    else if (
      typeof value === "string" &&
      value.startsWith("[") &&
      value.endsWith("]")
    ) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (typeof value === "string" && value.includes("|")) {
      // leave as string for "draft | frozen"
      const first = value.split("|")[0]!.trim();
      if (!value.includes(" ")) value = first;
    }
    data[key] = value;
  }
  return { data, body };
}

export function extractPhaseTable(
  ledgerBody: string,
): { phase: string; status: string }[] {
  const rows: { phase: string; status: string }[] = [];
  const lines = ledgerBody.split("\n");
  let inPhases = false;
  for (const line of lines) {
    if (line.startsWith("## Phases")) {
      inPhases = true;
      continue;
    }
    if (inPhases && line.startsWith("## ")) break;
    if (!inPhases) continue;
    if (!line.startsWith("|")) continue;
    if (line.includes("-----") || line.includes("Phase")) continue;
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length >= 2) {
      rows.push({ phase: cols[0]!, status: cols[1]! });
    }
  }
  return rows;
}

export function nextIncompletePhase(
  phases: { phase: string; status: string }[],
): string | null {
  const order = [
    "A_kernel",
    "B_workstreams",
    "C_integration",
    "D_validation",
    "E_documentation",
  ];
  for (const name of order) {
    const row = phases.find((p) => p.phase === name);
    if (!row || row.status !== "complete") return name;
  }
  return null;
}
