"use client";

import { useEffect, useState, type FormEvent } from "react";

type AuditLog = {
  log_id: number;
  actor_user_id: number | null;
  action: string | null;
  entity_type: string | null;
  entity_id: number | null;
  occurred_at: string | null;
};

type Filters = {
  action: string;
  from: string;
  to: string;
};

type AuditResponse = {
  logs: AuditLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

const PAGE_SIZE = 50;
const emptyFilters: Filters = { action: "", from: "", to: "" };

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "22px clamp(18px, 4vw, 28px)",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.04)",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuditLog(value: unknown): value is AuditLog {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.log_id) &&
    (typeof value.actor_user_id === "number" || value.actor_user_id === null) &&
    (typeof value.action === "string" || value.action === null) &&
    (typeof value.entity_type === "string" || value.entity_type === null) &&
    (typeof value.entity_id === "number" || value.entity_id === null) &&
    (typeof value.occurred_at === "string" || value.occurred_at === null)
  );
}

function errorMessage(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : fallback;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AuditLogViewer() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadLogs() {
      setLoading(true);
      setError("");
      const query = new URLSearchParams({ page: String(page) });
      if (filters.action) query.set("action", filters.action);
      if (filters.from) query.set("from", filters.from);
      if (filters.to) query.set("to", filters.to);

      try {
        const response = await fetch(`/api/admin/audit-logs?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(errorMessage(body, "Unable to load audit logs."));
        }
        if (
          !isRecord(body) ||
          !Array.isArray(body.logs) ||
          !body.logs.every(isAuditLog) ||
          !isRecord(body.pagination) ||
          body.pagination.page !== page ||
          body.pagination.pageSize !== PAGE_SIZE ||
          typeof body.pagination.total !== "number"
        ) {
          throw new Error("The audit log response was invalid.");
        }
        setData(body as AuditResponse);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load audit logs.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadLogs();
    return () => controller.abort();
  }, [filters.action, filters.from, filters.to, page]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilterError("");
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }
    if (draft.action.trim().length > 100) {
      setFilterError("Action filter must be 100 characters or fewer.");
      return;
    }
    setPage(1);
    setFilters({ action: draft.action.trim(), from: draft.from, to: draft.to });
  }

  function resetFilters() {
    setDraft(emptyFilters);
    setFilterError("");
    setPage(1);
    setFilters(emptyFilters);
  }

  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={cardStyle} aria-labelledby="audit-filter-title">
        <h2 id="audit-filter-title" style={{ margin: "0 0 14px", fontSize: 19 }}>Filter audit entries</h2>
        <form onSubmit={applyFilters}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 14, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6, color: "#344054", fontWeight: 600 }}>
              Action contains
              <input
                type="search"
                maxLength={100}
                value={draft.action}
                onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}
                placeholder="For example, INSERT"
                style={{ minHeight: 42, width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", font: "inherit", fontWeight: 400 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, color: "#344054", fontWeight: 600 }}>
              From date (IST)
              <input
                type="date"
                value={draft.from}
                onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                style={{ minHeight: 42, width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", font: "inherit", fontWeight: 400 }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, color: "#344054", fontWeight: 600 }}>
              To date (IST)
              <input
                type="date"
                value={draft.to}
                onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                style={{ minHeight: 42, width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", font: "inherit", fontWeight: 400 }}
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              <button type="submit" disabled={loading} style={{ minHeight: 42, border: 0, borderRadius: 8, background: "#3157a4", color: "#fff", padding: "8px 13px", font: "inherit", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
                Apply filters
              </button>
              <button type="button" onClick={resetFilters} disabled={loading} style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#344054", padding: "8px 13px", font: "inherit", fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
                Reset
              </button>
            </div>
          </div>
          {filterError && <p role="alert" style={{ margin: "12px 0 0", color: "#a32020" }}>{filterError}</p>}
        </form>
      </section>

      {error && <p role="alert" style={{ ...cardStyle, color: "#a32020" }}>{error}</p>}

      <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }} aria-labelledby="audit-results-title">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 24px 14px" }}>
          <h2 id="audit-results-title" style={{ margin: 0, fontSize: 19 }}>Audit entries</h2>
          {data && !error && <p style={{ margin: 0, color: "#596579" }}>{total.toLocaleString("en-IN")} matching entries</p>}
        </div>

        {loading ? (
          <p role="status" style={{ padding: "0 24px 22px", color: "#53627b" }}>Loading audit entries…</p>
        ) : error ? null : data?.logs.length === 0 ? (
          <p role="status" style={{ padding: "0 24px 22px", color: "#596579" }}>No audit entries match these filters.</p>
        ) : data ? (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>
                  Audit metadata. Sensitive detail payloads are not displayed.
                </caption>
                <thead>
                  <tr style={{ textAlign: "left", color: "#53627b", fontSize: 13 }}>
                    {["Timestamp", "Actor", "Action", "Target entity"].map((heading) => (
                      <th key={heading} scope="col" style={{ borderBottom: "1px solid #e2e8f0", padding: "11px 14px" }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((entry) => (
                    <tr key={entry.log_id}>
                      <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px", whiteSpace: "nowrap" }}>{entry.occurred_at ? `${formatTimestamp(entry.occurred_at)} IST` : "Not recorded"}</td>
                      <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>{entry.actor_user_id === null ? "System / not recorded" : `User #${entry.actor_user_id}`}</td>
                      <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px", fontWeight: 600 }}>{entry.action ?? "—"}</td>
                      <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>
                        {entry.entity_type ?? "—"}{entry.entity_id === null ? "" : ` #${entry.entity_id}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav aria-label="Audit log pages" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 24px" }}>
              <span role="status" style={{ color: "#596579" }}>Page {page} of {totalPages} · {PAGE_SIZE} entries per page</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setPage((current) => current - 1)} disabled={loading || page <= 1} style={{ minHeight: 38, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#344054", padding: "7px 11px", font: "inherit", cursor: loading || page <= 1 ? "not-allowed" : "pointer" }}>
                  Previous
                </button>
                <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading || page >= totalPages} style={{ minHeight: 38, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#344054", padding: "7px 11px", font: "inherit", cursor: loading || page >= totalPages ? "not-allowed" : "pointer" }}>
                  Next
                </button>
              </div>
            </nav>
          </>
        ) : null}
      </section>
    </div>
  );
}
