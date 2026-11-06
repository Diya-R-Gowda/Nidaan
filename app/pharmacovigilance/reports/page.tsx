import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ReviewRow = {
  report_id: number;
  onset_date: Date | string;
  reported_at: Date | string;
  severity_score: number | string;
  status: string;
  drug_name: string | null;
  total_count: number;
};

const pageSize = 25;
const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "#fff",
  padding: 20,
};

function dateLabel(value: Date | string, withTime = false): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

export default async function PharmacovigilanceInbox({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "pharmacovigilance") redirect("/");

  const params = await searchParams;
  const rawPage = params.page;
  const pageValue = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  const page = pageValue && /^[1-9]\d*$/.test(pageValue) ? Number(pageValue) : 1;
  if (!Number.isSafeInteger(page) || page > 100_000) redirect("/pharmacovigilance/reports");

  let reports: ReviewRow[] = [];
  let total = 0;
  let failed = false;
  try {
    const result = await pool.query<ReviewRow>(
      `SELECT r.report_id,
              r.onset_date,
              r.reported_at,
              COALESCE(r.severity_score, fn_severity_score(r.report_id)) AS severity_score,
              r.status,
              drug.drug_name,
              count(*) OVER()::int AS total_count
       FROM ade_report AS r
       LEFT JOIN prescription_item AS item ON item.item_id = r.item_id
       LEFT JOIN drug ON drug.drug_id = item.drug_id
       WHERE r.status IN ('new', 'under_review')
       ORDER BY r.reported_at DESC, r.report_id DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize],
    );
    reports = result.rows;
    total = reports[0]?.total_count ?? 0;
  } catch {
    failed = true;
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <div style={{ width: "100%", maxWidth: 1040, margin: "0 auto" }}>
        <a href="/pharmacovigilance" style={{ color: "#3157a4" }}>← Signal dashboard</a>
        <header style={{ margin: "22px 0" }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Pharmacovigilance</p>
          <h1 style={{ margin: "8px 0", fontSize: 32 }}>ADE report inbox</h1>
          <p style={{ margin: 0, color: "#596579", lineHeight: 1.6 }}>New and in-review reports, limited to the information needed for review. Patient identifiers are not shown.</p>
        </header>
        {failed ? (
          <p role="alert" style={{ ...cardStyle, color: "#a32020" }}>Reports could not be loaded. Please try again later.</p>
        ) : reports.length === 0 ? (
          <section role="status" style={cardStyle}>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>No reports awaiting review</h2>
            <p style={{ margin: 0, color: "#596579" }}>There are no new or in-review adverse-event reports on this page.</p>
          </section>
        ) : (
          <>
            <p role="status" style={{ color: "#596579" }}>{total} report{total === 1 ? "" : "s"} awaiting review</p>
            <div style={{ display: "grid", gap: 12 }}>
              {reports.map((report) => (
                <article key={report.report_id} style={cardStyle}>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 19 }}>
                        <a href={`/pharmacovigilance/reports/${report.report_id}`} style={{ color: "#244b91" }}>Report #{report.report_id}</a>
                      </h2>
                      <p style={{ margin: "8px 0 0", color: "#475467" }}>
                        {report.drug_name ? `Suspected item: ${report.drug_name}` : "Suspected item not linked"}
                      </p>
                    </div>
                    <span style={{ borderRadius: 999, background: "#eef2ff", padding: "5px 10px", fontWeight: 600, textTransform: "capitalize" }}>{report.status.replace("_", " ")}</span>
                  </div>
                  <dl style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px", margin: "14px 0 0", color: "#596579" }}>
                    <div><dt style={{ display: "inline", fontWeight: 600 }}>Reported: </dt><dd style={{ display: "inline", margin: 0 }}>{dateLabel(report.reported_at, true)} IST</dd></div>
                    <div><dt style={{ display: "inline", fontWeight: 600 }}>Onset: </dt><dd style={{ display: "inline", margin: 0 }}>{dateLabel(report.onset_date)}</dd></div>
                    <div><dt style={{ display: "inline", fontWeight: 600 }}>Severity score: </dt><dd style={{ display: "inline", margin: 0 }}>{Number(report.severity_score).toFixed(2)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
            <nav aria-label="Report inbox pages" style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              {page > 1 ? <a href={`/pharmacovigilance/reports?page=${page - 1}`} style={{ color: "#3157a4" }}>← Previous</a> : <span />}
              {page * pageSize < total ? <a href={`/pharmacovigilance/reports?page=${page + 1}`} style={{ color: "#3157a4" }}>Next →</a> : <span />}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
