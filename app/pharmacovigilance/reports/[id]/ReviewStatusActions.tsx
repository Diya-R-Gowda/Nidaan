"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewStatusActions({
  reportId,
  status,
}: {
  reportId: number;
  status: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"confirmed" | "dismissed" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function updateStatus(nextStatus: "confirmed" | "dismissed") {
    if (pending) return;
    setPending(nextStatus);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/ade-reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = response.status === 404
          ? "This report is no longer available."
          : response.status === 409
            ? "This report was already finalized. Refresh the page to see its current status."
            : "The report status could not be updated. Please try again.";
        throw new Error(message);
      }
      setSuccess(nextStatus === "confirmed" ? "Signal confirmed." : "Report dismissed.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The report status could not be updated.");
    } finally {
      setPending(null);
    }
  }

  if (status !== "new" && status !== "under_review") {
    return <p role="status" style={{ color: "#596579" }}>This report has been finalized.</p>;
  }

  return (
    <section aria-labelledby="review-action-title" style={{ marginTop: 18 }}>
      <h2 id="review-action-title" style={{ margin: "0 0 10px", fontSize: 18 }}>Review outcome</h2>
      <p style={{ margin: "0 0 12px", color: "#596579" }}>These actions record a review decision; they do not establish clinical causality.</p>
      {error && <p role="alert" style={{ color: "#a32020" }}>{error}</p>}
      {success && <p role="status" aria-live="polite" style={{ color: "#067647" }}>{success}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" onClick={() => void updateStatus("confirmed")} disabled={pending !== null} style={{ minHeight: 42, border: 0, borderRadius: 8, background: "#3157a4", color: "#fff", padding: "9px 14px", font: "inherit", fontWeight: 700 }}>
          {pending === "confirmed" ? "Confirming…" : "Confirm signal"}
        </button>
        <button type="button" onClick={() => void updateStatus("dismissed")} disabled={pending !== null} style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#344054", padding: "9px 14px", font: "inherit", fontWeight: 700 }}>
          {pending === "dismissed" ? "Dismissing…" : "Dismiss report"}
        </button>
      </div>
    </section>
  );
}
