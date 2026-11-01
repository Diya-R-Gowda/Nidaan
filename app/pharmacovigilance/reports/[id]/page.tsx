import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import SimilarReports from "./SimilarReports";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReportDetails = {
  report_id: number;
  narrative: string;
  onset_date: Date | string;
  reported_at: Date | string;
  severity_score: number | string | null;
  status: string | null;
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "22px clamp(18px, 4vw, 28px)",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.04)",
};

function formatDate(value: Date | string, includeTime = false): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

function formatSeverity(value: number | string | null): string {
  if (value === null) return "Not recorded";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "Not recorded";
}

function InvalidReportId() {
  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px", color: "#172033" }}>
      <section style={{ ...cardStyle, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>Invalid report ID</h1>
        <p style={{ margin: 0, color: "#596579" }}>Use a valid adverse-event report link.</p>
        <a href="/pharmacovigilance" style={{ display: "inline-block", marginTop: 16, color: "#3157a4" }}>
          Return to signal dashboard
        </a>
      </section>
    </main>
  );
}

export default async function PharmacovigilanceReportPage({ params }: RouteContext) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "pharmacovigilance") redirect("/");

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) return <InvalidReportId />;
  const reportId = Number(id);
  if (!Number.isSafeInteger(reportId) || reportId > 2_147_483_647) {
    return <InvalidReportId />;
  }

  let report: ReportDetails | undefined;
  try {
    const result = await pool.query<ReportDetails>(
      `SELECT report_id, narrative, onset_date, reported_at, severity_score, status
       FROM ade_report
       WHERE report_id = $1`,
      [reportId],
    );
    report = result.rows[0];
  } catch {
    return (
      <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px", color: "#172033" }}>
        <section role="alert" style={{ ...cardStyle, maxWidth: 800, margin: "0 auto", color: "#a32020" }}>
          This adverse-event report could not be loaded. Please try again later.
        </section>
      </main>
    );
  }

  if (!report) {
    return (
      <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px", color: "#172033" }}>
        <section style={{ ...cardStyle, maxWidth: 800, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>Report not found</h1>
          <p style={{ margin: 0, color: "#596579" }}>The requested adverse-event report does not exist.</p>
          <a href="/pharmacovigilance" style={{ display: "inline-block", marginTop: 16, color: "#3157a4" }}>
            Return to signal dashboard
          </a>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <div style={{ width: "100%", maxWidth: 1040, margin: "0 auto" }}>
        <a href="/pharmacovigilance" style={{ display: "inline-block", marginBottom: 20, color: "#3157a4" }}>
          ← Back to signal dashboard
        </a>
        <header style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Pharmacovigilance report
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32 }}>Report #{report.report_id}</h1>
        </header>

        <section style={{ ...cardStyle, marginBottom: 20 }} aria-labelledby="report-details-title">
          <h2 id="report-details-title" style={{ margin: "0 0 14px", fontSize: 20 }}>Report details</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px 20px", margin: "0 0 22px" }}>
            <div>
              <dt style={{ color: "#667085", fontSize: 13 }}>Reported onset</dt>
              <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{formatDate(report.onset_date)}</dd>
            </div>
            <div>
              <dt style={{ color: "#667085", fontSize: 13 }}>Submitted</dt>
              <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{formatDate(report.reported_at, true)} IST</dd>
            </div>
            <div>
              <dt style={{ color: "#667085", fontSize: 13 }}>Severity score</dt>
              <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{formatSeverity(report.severity_score)}</dd>
            </div>
            <div>
              <dt style={{ color: "#667085", fontSize: 13 }}>Status</dt>
              <dd style={{ margin: "4px 0 0", fontWeight: 600, textTransform: "capitalize" }}>{report.status?.replace("_", " ") ?? "Not recorded"}</dd>
            </div>
          </dl>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Reaction narrative</h3>
          <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{report.narrative}</p>
        </section>

        <SimilarReports reportId={report.report_id} />
      </div>
    </main>
  );
}
