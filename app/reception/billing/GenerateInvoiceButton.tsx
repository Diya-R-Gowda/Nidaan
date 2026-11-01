"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function GenerateInvoiceButton({ consultationId }: { consultationId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultation_id: consultationId }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isRecord(body) && isRecord(body.invoice) && Number.isSafeInteger(body.invoice.invoice_id)) {
        router.push(`/reception/billing/${body.invoice.invoice_id}`);
        return;
      }
      if (response.status === 409 && isRecord(body) && Number.isSafeInteger(body.invoice_id)) {
        router.push(`/reception/billing/${body.invoice_id}?duplicate=1`);
        return;
      }
      if (response.status === 404) {
        setError("This consultation is no longer available. Refresh the list.");
      } else if (response.status === 409) {
        setError("The consultation is not completed and cannot be invoiced yet.");
      } else if (response.status === 401 || response.status === 403) {
        setError("Your session is not authorized to generate invoices.");
      } else {
        setError(isRecord(body) && typeof body.error === "string" ? body.error : "The invoice could not be generated. Please try again.");
      }
    } catch {
      setError("The invoice service could not be reached. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={loading}
        aria-describedby={error ? `invoice-error-${consultationId}` : undefined}
        style={{ minHeight: 38, border: 0, borderRadius: 8, background: loading ? "#8ba0cb" : "#3157a4", color: "#fff", padding: "8px 12px", font: "inherit", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}
      >
        {loading ? "Generating…" : "Generate invoice"}
      </button>
      {error && <p id={`invoice-error-${consultationId}`} role="alert" style={{ maxWidth: 250, margin: "7px 0 0", color: "#a32020", fontSize: 13 }}>{error}</p>}
      {loading && <span role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>Generating invoice for consultation {consultationId}</span>}
    </div>
  );
}
