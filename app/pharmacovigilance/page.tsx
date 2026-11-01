import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";

type SignalRow = {
  drug_id: number;
  drug_name: string;
  patients_exposed: number | string;
  adverse_events: number | string;
  rate_per_100: number | string | null;
};

type SortColumn = "drug_name" | "patients_exposed" | "adverse_events" | "rate_per_100";
type SortDirection = "asc" | "desc";

const columns: Record<SortColumn, string> = {
  drug_name: "Drug",
  patients_exposed: "Patients exposed",
  adverse_events: "Adverse events",
  rate_per_100: "Rate per 100 exposed",
};

const pageStyle = {
  minHeight: "100vh",
  background: "#f4f7fb",
  padding: "36px 20px 56px",
  color: "#172033",
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "22px clamp(18px, 4vw, 28px)",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.04)",
};

function parseSort(value: string | string[] | undefined): SortColumn {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(columns, value)
    ? (value as SortColumn)
    : "rate_per_100";
}

function parseDirection(value: string | string[] | undefined): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function displayNumber(value: number | string | null, fractionDigits = 0): string {
  if (value === null) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(parsed);
}

function LoadingSignals() {
  return (
    <p role="status" style={{ ...cardStyle, color: "#53627b" }}>
      Loading drug signal rates…
    </p>
  );
}

async function SignalDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const direction = parseDirection(params.direction);
  const sortSql = sort;
  const directionSql = direction.toUpperCase();

  try {
    const result = await pool.query<SignalRow>(
      `SELECT drug_id, drug_name, patients_exposed, adverse_events, rate_per_100
       FROM vw_drug_signal_rates
       ORDER BY ${sortSql} ${directionSql} NULLS LAST, drug_name ASC`,
    );
    const signals = result.rows;

    if (signals.length === 0) {
      return (
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>No signal data available</h2>
          <p style={{ margin: 0, color: "#596579", lineHeight: 1.6 }}>
            The drug signal view has no records to display yet.
          </p>
        </section>
      );
    }

    const maxRate = Math.max(
      0,
      ...signals.map((signal) => Number(signal.rate_per_100) || 0),
    );

    return (
      <>
        <section style={{ ...cardStyle, marginBottom: 18 }} aria-labelledby="signal-chart-title">
          <h2 id="signal-chart-title" style={{ margin: "0 0 6px", fontSize: 20 }}>
            Signal rate by drug
          </h2>
          <p style={{ margin: "0 0 20px", color: "#596579", lineHeight: 1.5 }}>
            Adverse-event reports per 100 exposed patients. Bar lengths are scaled to the highest rate shown ({displayNumber(maxRate, 2)}); values are not capped at 100.
          </p>
          <div role="list" aria-label="Drug signal rates" style={{ display: "grid", gap: 13 }}>
            {signals.map((signal) => {
              const rate = Number(signal.rate_per_100) || 0;
              const width = maxRate > 0 ? (rate / maxRate) * 100 : 0;
              return (
                <div
                  role="listitem"
                  key={signal.drug_id}
                  aria-label={`${signal.drug_name}: ${displayNumber(signal.rate_per_100, 2)} adverse-event reports per 100 exposed patients`}
                  style={{ display: "grid", gridTemplateColumns: "minmax(110px, 190px) minmax(0, 1fr) auto", alignItems: "center", gap: 12 }}
                >
                  <span style={{ overflowWrap: "anywhere", fontWeight: 600 }}>{signal.drug_name}</span>
                  <div
                    aria-hidden="true"
                    style={{ height: 14, borderRadius: 999, background: "#e9eef7", overflow: "hidden" }}
                  >
                    <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: "#3157a4" }} />
                  </div>
                  <span style={{ minWidth: 76, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {displayNumber(signal.rate_per_100, 2)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }} aria-labelledby="signal-table-title">
          <h2 id="signal-table-title" style={{ margin: 0, padding: "22px 24px 12px", fontSize: 20 }}>
            Drug signal data
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
              <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>
                Drug-level exposure and adverse-event signal rates
              </caption>
              <thead>
                <tr style={{ textAlign: "left", color: "#53627b", fontSize: 13 }}>
                  {(Object.keys(columns) as SortColumn[]).map((column) => {
                    const active = sort === column;
                    const nextDirection = active && direction === "desc" ? "asc" : "desc";
                    const ariaSort = active
                      ? direction === "asc" ? "ascending" : "descending"
                      : "none";
                    return (
                      <th
                        key={column}
                        scope="col"
                        aria-sort={ariaSort}
                        style={{ borderBottom: "1px solid #e2e8f0", padding: "12px 16px" }}
                      >
                        <a
                          href={`?sort=${column}&direction=${nextDirection}`}
                          style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}
                        >
                          {columns[column]}{active ? direction === "asc" ? " ↑" : " ↓" : ""}
                        </a>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {signals.map((signal) => (
                  <tr key={signal.drug_id}>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 16px", fontWeight: 600 }}>
                      {signal.drug_name}
                    </td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 16px", fontVariantNumeric: "tabular-nums" }}>
                      {displayNumber(signal.patients_exposed)}
                    </td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 16px", fontVariantNumeric: "tabular-nums" }}>
                      {displayNumber(signal.adverse_events)}
                    </td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 16px", fontVariantNumeric: "tabular-nums" }}>
                      {displayNumber(signal.rate_per_100, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  } catch {
    return (
      <p role="alert" style={{ ...cardStyle, color: "#a32020" }}>
        Drug signal rates could not be loaded. Please try again later.
      </p>
    );
  }
}

export default async function PharmacovigilancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readSession();

  if (!session) {
    redirect("/login");
  }
  if (session.role !== "pharmacovigilance") {
    redirect("/");
  }

  return (
    <main style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ margin: "0 0 26px" }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Pharmacovigilance
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, letterSpacing: "-0.03em" }}>
            Drug signal dashboard
          </h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>
            Aggregate adverse-event rates by drug. This view contains no patient-identifying data.
          </p>
        </header>
        <Suspense fallback={<LoadingSignals />}>
          <SignalDashboard searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
