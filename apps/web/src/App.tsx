import { useEffect, useState, startTransition, type CSSProperties } from "react";
import { api } from "./api";

type View = "inbox" | "portfolio" | "contracts" | "lineage" | "approvals";

type InboxResponse = {
  channel: Array<{
    id: string;
    type: string;
    status: string;
    to_addr: string;
    from_addr: string;
    body: string;
  }>;
  approvals: Array<{
    id: string;
    kind: string;
    status: string;
    subject: string;
    blast_radius: string;
    program_id?: string;
  }>;
};

const nav: { id: View; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "portfolio", label: "Portfolio" },
  { id: "contracts", label: "Contracts" },
  { id: "lineage", label: "Lineage" },
  { id: "approvals", label: "Approvals" },
];

export function App() {
  const [view, setView] = useState<View>("inbox");
  const [error, setError] = useState<string | null>(null);
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [portfolio, setPortfolio] = useState<{
    initiatives: Array<Record<string, unknown>>;
    programs: Array<Record<string, unknown>>;
  } | null>(null);
  const [contracts, setContracts] = useState<Array<Record<string, unknown>>>([]);
  const [lineage, setLineage] = useState<Array<Record<string, unknown>>>([]);
  const [programId, setProgramId] = useState("default");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError(null);
    try {
      if (view === "inbox" || view === "approvals") {
        setInbox(await api<InboxResponse>("/inbox"));
      }
      if (view === "portfolio") {
        setPortfolio(await api("/portfolio"));
      }
      if (view === "contracts") {
        const r = await api<{ contracts: Array<Record<string, unknown>> }>("/contracts");
        setContracts(r.contracts);
      }
      if (view === "lineage") {
        const r = await api<{ events: Array<Record<string, unknown>> }>(
          `/programs/${encodeURIComponent(programId)}/lineage`,
        );
        setLineage(r.events);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    startTransition(() => {
      void refresh();
    });
  }, [view, programId]);

  async function decide(id: string, decision: "approve" | "reject" | "defer") {
    setBusy(true);
    try {
      await api(`/approvals/${id}`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportLineage() {
    const blob = new Blob([JSON.stringify(lineage, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skailr-lineage-${programId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const focus = inbox?.approvals?.find((a) => a.id === selected) || null;

  return (
    <div style={shell}>
      <header style={header}>
        <div>
          <div style={brand}>Skailr</div>
          <p style={tagline}>Decide only what needs you.</p>
        </div>
        <nav style={navRow} aria-label="Primary">
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              style={view === n.id ? navActive : navBtn}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div style={errorBox}>
          <strong>API unreachable.</strong> Start with <code>skailr serve</code> then{" "}
          <code>skailr sync import</code>. {error}
        </div>
      )}

      <main style={main}>
        {view === "inbox" && (
          <section style={compose}>
            <div style={listPane}>
              <h1 style={h1}>Exception inbox</h1>
              <p style={sub}>
                Open human gates, contract changes, and blockers. Everything else stays with the
                teams.
              </p>
              <ul style={list}>
                {(inbox?.approvals || []).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      style={selected === a.id ? itemActive : item}
                      onClick={() => setSelected(a.id)}
                    >
                      <span style={kind}>{a.kind}</span>
                      <span>{a.subject}</span>
                    </button>
                  </li>
                ))}
                {!inbox?.approvals?.length && <li style={empty}>Inbox clear.</li>}
              </ul>
            </div>
            <div style={detailPane}>
              {focus ? (
                <>
                  <h2 style={h2}>{focus.subject}</h2>
                  <p style={meta}>
                    {focus.kind} · {focus.status}
                    {focus.program_id ? ` · ${focus.program_id}` : ""}
                  </p>
                  <p style={meta}>
                    Blast radius:{" "}
                    {(() => {
                      try {
                        return JSON.parse(focus.blast_radius || "[]").join(", ") || "—";
                      } catch {
                        return focus.blast_radius || "—";
                      }
                    })()}
                  </p>
                  <div style={actions}>
                    <button type="button" disabled={busy} style={primary} onClick={() => decide(focus.id, "approve")}>
                      Approve
                    </button>
                    <button type="button" disabled={busy} style={ghost} onClick={() => decide(focus.id, "defer")}>
                      Defer
                    </button>
                    <button type="button" disabled={busy} style={danger} onClick={() => decide(focus.id, "reject")}>
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <p style={sub}>Select an exception to act.</p>
              )}
            </div>
          </section>
        )}

        {view === "portfolio" && (
          <section>
            <h1 style={h1}>Portfolio</h1>
            <p style={sub}>Initiatives and programs — traffic from the store projections.</p>
            <div style={grid}>
              <div>
                <h2 style={h2}>Initiatives</h2>
                <ul style={plainList}>
                  {(portfolio?.initiatives || []).map((i) => (
                    <li key={String(i.id)}>
                      <strong>{String(i.name)}</strong> · {String(i.status)}
                    </li>
                  ))}
                  {!portfolio?.initiatives?.length && <li style={empty}>No initiatives yet.</li>}
                </ul>
              </div>
              <div>
                <h2 style={h2}>Programs</h2>
                <ul style={plainList}>
                  {(portfolio?.programs || []).map((p) => (
                    <li key={String(p.id)}>
                      <button type="button" style={linkish} onClick={() => { setProgramId(String(p.id)); setView("lineage"); }}>
                        {String(p.name)}
                      </button>{" "}
                      · {String(p.status)}
                      {p.next_phase ? ` → ${String(p.next_phase)}` : ""}
                    </li>
                  ))}
                  {!portfolio?.programs?.length && <li style={empty}>No programs imported.</li>}
                </ul>
              </div>
            </div>
          </section>
        )}

        {view === "contracts" && (
          <section>
            <h1 style={h1}>Contract wall</h1>
            <p style={sub}>Frozen seams and versions. Pending changes appear in the inbox.</p>
            <ul style={plainList}>
              {contracts.map((c) => (
                <li key={String(c.id)}>
                  <strong>{String(c.id)}</strong> v{String(c.version)} · {String(c.status)}
                </li>
              ))}
              {!contracts.length && <li style={empty}>No contracts in store.</li>}
            </ul>
          </section>
        )}

        {view === "lineage" && (
          <section>
            <h1 style={h1}>Lineage</h1>
            <p style={sub}>
              Event trail for program{" "}
              <input
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                style={input}
              />
            </p>
            <button type="button" style={ghost} onClick={() => void exportLineage()}>
              Export JSON
            </button>
            <ol style={timeline}>
              {lineage.map((e) => (
                <li key={String(e.id)}>
                  <time>{String(e.ts)}</time> <strong>{String(e.type)}</strong> · {String(e.actor)}
                </li>
              ))}
              {!lineage.length && <li style={empty}>No events.</li>}
            </ol>
          </section>
        )}

        {view === "approvals" && (
          <section>
            <h1 style={h1}>Approvals</h1>
            <p style={sub}>Story, spec, plan, contract, and release gates currently open.</p>
            <ul style={plainList}>
              {(inbox?.approvals || []).map((a) => (
                <li key={a.id}>
                  {a.kind}: {a.subject}{" "}
                  <button type="button" style={linkish} onClick={() => { setSelected(a.id); setView("inbox"); }}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

const shell: CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "2.5rem 1.5rem 4rem",
};
const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "2rem",
  alignItems: "end",
  borderBottom: "1px solid var(--line)",
  paddingBottom: "1.5rem",
  marginBottom: "2rem",
};
const brand: CSSProperties = {
  fontFamily: "var(--display)",
  fontSize: "3.25rem",
  lineHeight: 1,
  letterSpacing: "-0.02em",
};
const tagline: CSSProperties = { margin: "0.5rem 0 0", color: "var(--muted)" };
const navRow: CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap" };
const navBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.45rem 0.8rem",
  borderRadius: 0,
};
const navActive: CSSProperties = {
  ...navBtn,
  borderColor: "var(--accent)",
  color: "var(--accent)",
};
const main: CSSProperties = { minHeight: "60vh" };
const compose: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: "2rem",
};
const listPane: CSSProperties = {};
const detailPane: CSSProperties = {
  borderLeft: "1px solid var(--line)",
  paddingLeft: "1.5rem",
  animation: "fade 240ms ease",
};
const h1: CSSProperties = {
  fontFamily: "var(--display)",
  fontSize: "2.4rem",
  fontWeight: 400,
  margin: "0 0 0.4rem",
};
const h2: CSSProperties = { fontSize: "1.1rem", margin: "0 0 0.75rem" };
const sub: CSSProperties = { color: "var(--muted)", marginTop: 0, maxWidth: 42 + "rem" };
const list: CSSProperties = { listStyle: "none", padding: 0, margin: "1.5rem 0 0" };
const item: CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.9rem 0",
  display: "grid",
  gap: "0.25rem",
};
const itemActive: CSSProperties = {
  ...item,
  color: "var(--accent)",
};
const kind: CSSProperties = {
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--muted)",
};
const actions: CSSProperties = { display: "flex", gap: "0.6rem", marginTop: "1.5rem" };
const primary: CSSProperties = {
  background: "var(--accent)",
  color: "#04140c",
  border: "none",
  padding: "0.65rem 1rem",
  fontWeight: 600,
};
const ghost: CSSProperties = {
  background: "transparent",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  padding: "0.65rem 1rem",
};
const danger: CSSProperties = {
  background: "transparent",
  color: "var(--danger)",
  border: "1px solid var(--danger)",
  padding: "0.65rem 1rem",
};
const errorBox: CSSProperties = {
  border: "1px solid var(--warn)",
  color: "var(--warn)",
  padding: "0.85rem 1rem",
  marginBottom: "1.5rem",
};
const empty: CSSProperties = { color: "var(--muted)", padding: "0.75rem 0" };
const meta: CSSProperties = { color: "var(--muted)" };
const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "2rem",
  marginTop: "1.5rem",
};
const plainList: CSSProperties = { listStyle: "none", padding: 0 };
const timeline: CSSProperties = { marginTop: "1.5rem", paddingLeft: "1.2rem" };
const input: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.25rem 0.5rem",
  marginLeft: "0.4rem",
};
const linkish: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  padding: 0,
  textDecoration: "underline",
};
