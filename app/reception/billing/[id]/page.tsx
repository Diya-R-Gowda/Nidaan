import { notFound, redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

type InvoiceDetail = {
  invoice_id: number;
  consultation_id: number;
  subtotal: string | number | null;
  tax_amount: string | number | null;
  total: string | number | null;
  status: string | null;
  issued_at: Date | string | null;
  patient_name: string;
  doctor_name: string;
  slot_start: Date | string;
};

type InvoiceLine = {
  line_id: number;
  line_type: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: string | number | null;
  line_total: string | number | null;
};

function amount(value: string | number | null): string {
  const number = value === null ? NaN : Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function dateTime(value: Date | string | null): string {
  if (value === null) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function PrintableInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "receptionist") redirect("/");

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const invoiceId = Number(id);
  if (!Number.isSafeInteger(invoiceId) || invoiceId > 2_147_483_647) notFound();

  let invoice: InvoiceDetail | undefined;
  let lines: InvoiceLine[] = [];
  try {
    const [invoiceResult, linesResult] = await Promise.all([
      pool.query<InvoiceDetail>(
        `SELECT invoice.invoice_id, invoice.consultation_id, invoice.subtotal,
                invoice.tax_amount, invoice.total, invoice.status, invoice.issued_at,
                patient.full_name AS patient_name,
                account.full_name AS doctor_name,
                appointment.slot_start
         FROM invoice
         JOIN consultation ON consultation.consultation_id = invoice.consultation_id
         JOIN appointment ON appointment.appointment_id = consultation.appointment_id
         JOIN patient ON patient.patient_id = appointment.patient_id
         JOIN doctor ON doctor.doctor_id = appointment.doctor_id
         JOIN user_account AS account ON account.user_id = doctor.user_id
         WHERE invoice.invoice_id = $1`,
        [invoiceId],
      ),
      pool.query<InvoiceLine>(
        `SELECT line_id, line_type, description, quantity, unit_price, line_total
         FROM invoice_line
         WHERE invoice_id = $1
         ORDER BY line_id`,
        [invoiceId],
      ),
    ]);
    invoice = invoiceResult.rows[0];
    lines = linesResult.rows;
  } catch {
    return (
      <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: 32, color: "#172033" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: 24 }}>
          <h1 style={{ fontSize: 26 }}>Invoice unavailable</h1>
          <p role="alert" style={{ color: "#a32020" }}>The invoice could not be loaded. Please try again later.</p>
          <a href="/reception/billing">Return to billing</a>
        </div>
      </main>
    );
  }
  if (!invoice) notFound();

  const search = await searchParams;
  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <style>{`@media print { body { background: #fff !important; } .invoice-shell { box-shadow: none !important; border: 0 !important; } .no-print { display: none !important; } }`}</style>
      <div style={{ width: "100%", maxWidth: 820, margin: "0 auto" }}>
        <nav className="no-print" aria-label="Billing navigation" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
          <a href="/reception/billing" style={{ color: "#3157a4", fontWeight: 600 }}>← Back to billing</a>
          <PrintButton />
        </nav>
        {search.duplicate === "1" && <p className="no-print" role="status" style={{ color: "#8a4b08" }}>This consultation already had an invoice. Showing the existing invoice.</p>}
        <article className="invoice-shell" style={{ border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: "clamp(20px, 5vw, 40px)", boxShadow: "0 12px 32px rgba(22, 34, 57, 0.05)" }}>
          <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 18, borderBottom: "2px solid #e2e8f0", paddingBottom: 20 }}>
            <div>
              <p style={{ margin: 0, color: "#53627b", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 13 }}>Nidaan</p>
              <h1 style={{ margin: "8px 0 0", fontSize: 30 }}>Invoice #{invoice.invoice_id}</h1>
            </div>
            <dl style={{ margin: 0, display: "grid", gap: 8 }}>
              <div><dt style={{ color: "#667085", fontSize: 12 }}>Status</dt><dd style={{ margin: "3px 0 0", fontWeight: 700 }}>{invoice.status ?? "—"}</dd></div>
              <div><dt style={{ color: "#667085", fontSize: 12 }}>Issued</dt><dd style={{ margin: "3px 0 0" }}>{dateTime(invoice.issued_at)} IST</dd></div>
            </dl>
          </header>

          <section aria-label="Invoice details" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, padding: "20px 0" }}>
            <div><span style={{ color: "#667085", fontSize: 12 }}>Patient</span><div style={{ marginTop: 4, fontWeight: 600 }}>{invoice.patient_name}</div></div>
            <div><span style={{ color: "#667085", fontSize: 12 }}>Doctor</span><div style={{ marginTop: 4, fontWeight: 600 }}>{invoice.doctor_name}</div></div>
            <div><span style={{ color: "#667085", fontSize: 12 }}>Consultation</span><div style={{ marginTop: 4, fontWeight: 600 }}>#{invoice.consultation_id}</div></div>
            <div><span style={{ color: "#667085", fontSize: 12 }}>Appointment</span><div style={{ marginTop: 4, fontWeight: 600 }}>{dateTime(invoice.slot_start)} IST</div></div>
          </section>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
              <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>Itemised invoice lines</caption>
              <thead><tr style={{ textAlign: "left", color: "#53627b", fontSize: 13 }}>{["Type", "Description", "Qty", "Unit price", "Line total"].map((heading) => <th key={heading} scope="col" style={{ borderBottom: "1px solid #cbd5e1", padding: 10 }}>{heading}</th>)}</tr></thead>
              <tbody>{lines.map((line) => (
                <tr key={line.line_id}>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: 10 }}>{line.line_type ?? "—"}</td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: 10 }}>{line.description ?? "—"}</td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: 10 }}>{line.quantity ?? "—"}</td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: 10, whiteSpace: "nowrap" }}>{amount(line.unit_price)}</td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: 10, whiteSpace: "nowrap" }}>{amount(line.line_total)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <dl style={{ maxWidth: 340, margin: "20px 0 0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 20px" }}>
            <dt>Subtotal</dt><dd style={{ margin: 0, textAlign: "right" }}>{amount(invoice.subtotal)}</dd>
            <dt>Tax</dt><dd style={{ margin: 0, textAlign: "right" }}>{amount(invoice.tax_amount)}</dd>
            <dt style={{ borderTop: "1px solid #cbd5e1", paddingTop: 10, fontWeight: 700 }}>Total</dt><dd style={{ margin: 0, borderTop: "1px solid #cbd5e1", paddingTop: 10, textAlign: "right", fontWeight: 700 }}>{amount(invoice.total)}</dd>
          </dl>
        </article>
      </div>
    </main>
  );
}
