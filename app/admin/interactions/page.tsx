"use client";

import { useEffect, useState, type FormEvent } from "react";

export const dynamic = "force-dynamic";

type Drug = {
  drug_id: number;
  drug_name: string;
};

type Interaction = {
  drug_a_id: number;
  drug_b_id: number;
  drug_a_name: string;
  drug_b_name: string;
  severity: string;
  mechanism: string;
  clinical_effect: string;
  reference_source: string | null;
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

function errorMessage(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : fallback;
}

export default function AdminInteractionsPage() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [drugAId, setDrugAId] = useState("");
  const [drugBId, setDrugBId] = useState("");
  const [severity, setSeverity] = useState("moderate");
  const [mechanism, setMechanism] = useState("");
  const [clinicalEffect, setClinicalEffect] = useState("");
  const [referenceSource, setReferenceSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [drugResponse, interactionResponse] = await Promise.all([
        fetch("/api/admin/drugs", { cache: "no-store" }),
        fetch("/api/admin/interactions", { cache: "no-store" }),
      ]);
      const drugBody: unknown = await drugResponse.json().catch(() => null);
      const interactionBody: unknown = await interactionResponse.json().catch(() => null);
      if (!drugResponse.ok) throw new Error(errorMessage(drugBody, "Unable to load drugs."));
      if (!interactionResponse.ok) {
        throw new Error(errorMessage(interactionBody, "Unable to load interactions."));
      }
      if (
        !isRecord(drugBody) ||
        !Array.isArray(drugBody.drugs) ||
        !isRecord(interactionBody) ||
        !Array.isArray(interactionBody.interactions)
      ) {
        throw new Error("The interaction response was invalid.");
      }
      setDrugs(drugBody.drugs as Drug[]);
      setInteractions(interactionBody.interactions as Interaction[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load interactions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function addInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!drugAId || !drugBId || drugAId === drugBId) {
      setError("Choose two different drugs.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drug_a_id: Number(drugAId),
          drug_b_id: Number(drugBId),
          severity,
          mechanism,
          clinical_effect: clinicalEffect,
          reference_source: referenceSource,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Unable to add interaction."));
      setMechanism("");
      setClinicalEffect("");
      setReferenceSource("");
      setSuccess("Drug interaction added.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add interaction.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteInteraction(interaction: Interaction) {
    const key = `${interaction.drug_a_id}-${interaction.drug_b_id}`;
    setDeleting(key);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/interactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drug_a_id: interaction.drug_a_id,
          drug_b_id: interaction.drug_b_id,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Unable to delete interaction."));
      setInteractions((current) =>
        current.filter(
          (item) =>
            item.drug_a_id !== interaction.drug_a_id ||
            item.drug_b_id !== interaction.drug_b_id,
        ),
      );
      setSuccess("Drug interaction deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete interaction.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "36px 20px 56px", color: "#172033" }}>
      <div style={{ width: "100%", maxWidth: 1120, margin: "0 auto" }}>
        <a href="/admin" style={{ display: "inline-block", marginBottom: 20, color: "#3157a4" }}>
          ← Back to administration
        </a>
        <header style={{ marginBottom: 26 }}>
          <p style={{ margin: 0, color: "#53627b", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Administration
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 32 }}>Drug interactions</h1>
          <p style={{ margin: "10px 0 0", color: "#596579", lineHeight: 1.6 }}>
            Maintain interaction rules used during prescription safety checks.
          </p>
        </header>

        {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
        {success && <p role="status" style={{ color: "green" }}>{success}</p>}

        <section style={{ ...cardStyle, marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 18px", fontSize: 20 }}>Add interaction</h2>
          <form onSubmit={addInteraction} style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <label>
                First drug
                <select required value={drugAId} onChange={(event) => setDrugAId(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6 }}>
                  <option value="">Select a drug</option>
                  {drugs.map((drug) => <option key={drug.drug_id} value={drug.drug_id}>{drug.drug_name}</option>)}
                </select>
              </label>
              <label>
                Second drug
                <select required value={drugBId} onChange={(event) => setDrugBId(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6 }}>
                  <option value="">Select a drug</option>
                  {drugs.map((drug) => <option key={drug.drug_id} value={drug.drug_id}>{drug.drug_name}</option>)}
                </select>
              </label>
              <label>
                Severity
                <select value={severity} onChange={(event) => setSeverity(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6 }}>
                  <option value="minor">Minor</option>
                  <option value="moderate">Moderate</option>
                  <option value="major">Major</option>
                </select>
              </label>
            </div>
            <label>Mechanism<textarea required value={mechanism} onChange={(event) => setMechanism(event.target.value)} rows={3} style={{ display: "block", width: "100%", marginTop: 6 }} /></label>
            <label>Clinical effect<textarea required value={clinicalEffect} onChange={(event) => setClinicalEffect(event.target.value)} rows={3} style={{ display: "block", width: "100%", marginTop: 6 }} /></label>
            <label>Reference source<textarea value={referenceSource} onChange={(event) => setReferenceSource(event.target.value)} rows={2} style={{ display: "block", width: "100%", marginTop: 6 }} /></label>
            <button type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add interaction"}</button>
          </form>
        </section>

        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 18px", fontSize: 20 }}>Existing interactions</h2>
          {loading ? <p>Loading interactions...</p> : interactions.length === 0 ? <p>No interactions found.</p> : (
            <div style={{ display: "grid", gap: 14 }}>
              {interactions.map((interaction) => {
                const key = `${interaction.drug_a_id}-${interaction.drug_b_id}`;
                return (
                  <article key={key} style={{ padding: 16, border: "1px solid #e2e8f0", borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{interaction.drug_a_name} + {interaction.drug_b_name}</h3>
                        <p style={{ margin: "6px 0", color: "#596579" }}><strong>{interaction.severity}</strong> — {interaction.clinical_effect}</p>
                        <p style={{ margin: 0, color: "#596579" }}>{interaction.mechanism}</p>
                        {interaction.reference_source && <p style={{ margin: "6px 0 0", color: "#596579" }}>Source: {interaction.reference_source}</p>}
                      </div>
                      <button type="button" onClick={() => void deleteInteraction(interaction)} disabled={deleting === key}>
                        {deleting === key ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
