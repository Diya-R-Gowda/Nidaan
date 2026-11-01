"use client";

import { useEffect, useState } from "react";

type ComparisonMode = "vector" | "fulltext";

type SimilarReport = {
  report_id: number;
  narrative: string;
  onset_date: string;
  cosine_similarity?: number;
  fulltext_relevance?: number;
};

type SimilarResponse = {
  reportId: number;
  mode: ComparisonMode;
  scoreDescription: string;
  neighbours: SimilarReport[];
};

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

function isSimilarReport(value: unknown): value is SimilarReport {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.report_id) &&
    typeof value.narrative === "string" &&
    typeof value.onset_date === "string" &&
    (value.cosine_similarity === undefined || typeof value.cosine_similarity === "number") &&
    (value.fulltext_relevance === undefined || typeof value.fulltext_relevance === "number")
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
  }).format(date);
}

export default function SimilarReports({ reportId }: { reportId: number }) {
  const [mode, setMode] = useState<ComparisonMode>("vector");
  const [data, setData] = useState<SimilarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSimilarReports() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const response = await fetch(
          `/api/ade-reports/${reportId}/similar?mode=${mode}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message = isRecord(body) && typeof body.error === "string"
            ? body.error
            : "Unable to load similar reports.";
          if (response.status === 404) {
            throw new Error("This source report is no longer available.");
          }
          throw new Error(message);
        }

        if (
          !isRecord(body) ||
          body.reportId !== reportId ||
          body.mode !== mode ||
          typeof body.scoreDescription !== "string" ||
          !Array.isArray(body.neighbours) ||
          !body.neighbours.every(isSimilarReport)
        ) {
          throw new Error("The similar-reports response was invalid.");
        }

        setData(body as SimilarResponse);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load similar reports.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSimilarReports();
    return () => controller.abort();
  }, [mode, reportId]);

  const scoreLabel = mode === "vector"
    ? "Cosine similarity"
    : "Full-text relevance (ts_rank_cd)";

  return (
    <section style={cardStyle} aria-labelledby="similar-reports-title">
      <h2 id="similar-reports-title" style={{ margin: "0 0 8px", fontSize: 20 }}>
        Similar reports
      </h2>
      <p style={{ margin: "0 0 16px", color: "#596579", lineHeight: 1.5 }}>
        Compare this report with up to 10 other reports. Similarity and full-text relevance are different ranking measures.
      </p>

      <div role="group" aria-label="Similar report comparison mode" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        {([
          ["vector", "Vector similarity"],
          ["fulltext", "Full-text comparison"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            style={{
              minHeight: 42,
              border: mode === value ? "2px solid #3157a4" : "1px solid #cbd5e1",
              borderRadius: 9,
              background: mode === value ? "#eff6ff" : "#fff",
              color: "#172033",
              padding: "8px 13px",
              font: "inherit",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p role="status" style={{ color: "#53627b" }}>Loading {mode === "vector" ? "similarity" : "full-text"} results…</p>}
      {error && <p role="alert" style={{ color: "#a32020" }}>{error}</p>}

      {!loading && !error && data && (
        <>
          <p style={{ color: "#53627b", fontSize: 13, lineHeight: 1.5 }}>
            Score: {data.scoreDescription}
          </p>
          {data.neighbours.length === 0 ? (
            <p role="status" style={{ marginBottom: 0, color: "#596579" }}>
              No reports matched this {mode === "vector" ? "similarity" : "full-text"} search.
            </p>
          ) : (
            <ol aria-label={`${mode === "vector" ? "Vector similarity" : "Full-text comparison"} results`} style={{ display: "grid", gap: 12, listStyle: "none", margin: 0, padding: 0 }}>
              {data.neighbours.map((neighbour) => {
                const score = mode === "vector"
                  ? neighbour.cosine_similarity
                  : neighbour.fulltext_relevance;
                return (
                  <li key={neighbour.report_id}>
                    <article style={{ border: "1px solid #e8edf4", borderRadius: 12, padding: "16px 18px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>Report #{neighbour.report_id}</h3>
                        <span style={{ color: "#344054", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {scoreLabel}: {typeof score === "number" && Number.isFinite(score) ? score.toFixed(4) : "Unavailable"}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 10px", color: "#667085", fontSize: 13 }}>
                        Onset: {formatDate(neighbour.onset_date)}
                      </p>
                      <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {neighbour.narrative}
                      </p>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
