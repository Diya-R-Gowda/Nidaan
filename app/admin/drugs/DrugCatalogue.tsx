"use client";

import { useEffect, useState, type FormEvent } from "react";

type Drug = {
  drug_id: number;
  drug_name: string;
  generic_name: string;
  drug_class: string;
  form: string;
  strength: string;
  unit_price: string | number;
  is_active: boolean;
};

type DrugFields = {
  drug_name: string;
  generic_name: string;
  drug_class: string;
  form: string;
  strength: string;
  unit_price: string;
};

const initialFields: DrugFields = {
  drug_name: "",
  generic_name: "",
  drug_class: "",
  form: "",
  strength: "",
  unit_price: "",
};

const limits: Record<keyof Omit<DrugFields, "unit_price">, number> = {
  drug_name: 160,
  generic_name: 160,
  drug_class: 120,
  form: 60,
  strength: 60,
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

function isDrug(value: unknown): value is Drug {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.drug_id) &&
    typeof value.drug_name === "string" &&
    typeof value.generic_name === "string" &&
    typeof value.drug_class === "string" &&
    typeof value.form === "string" &&
    typeof value.strength === "string" &&
    (typeof value.unit_price === "string" || typeof value.unit_price === "number") &&
    typeof value.is_active === "boolean"
  );
}

function errorMessage(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : fallback;
}

function formatPrice(value: string | number): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export default function DrugCatalogue() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [fields, setFields] = useState<DrugFields>(initialFields);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDrugs() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/admin/drugs", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(errorMessage(body, "Unable to load the drug catalogue."));
        }
        if (!isRecord(body) || !Array.isArray(body.drugs) || !body.drugs.every(isDrug)) {
          throw new Error("The drug catalogue response was invalid.");
        }
        setDrugs(body.drugs);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setLoadError(cause instanceof Error ? cause.message : "Unable to load the drug catalogue.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadDrugs();
    return () => controller.abort();
  }, []);

  function updateField(field: keyof DrugFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  async function addDrug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || deactivatingId !== null) return;
    setActionError("");
    setSuccess("");

    for (const [field, maximum] of Object.entries(limits) as [keyof typeof limits, number][]) {
      const value = fields[field].trim();
      if (!value || value.length > maximum) {
        setActionError(`${field.replace("_", " ")} is required and must be at most ${maximum} characters.`);
        return;
      }
    }

    const price = Number(fields.unit_price);
    if (!fields.unit_price.trim() || !Number.isFinite(price) || price < 0 || !/^\d+(\.\d{1,2})?$/.test(fields.unit_price.trim())) {
      setActionError("Enter a non-negative unit price with no more than two decimal places.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/drugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drug_name: fields.drug_name.trim(),
          generic_name: fields.generic_name.trim(),
          drug_class: fields.drug_class.trim(),
          form: fields.form.trim(),
          strength: fields.strength.trim(),
          unit_price: price,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Unable to add the drug."));
      if (!isRecord(body) || !isDrug(body.drug)) {
        throw new Error("The drug creation response was invalid.");
      }

      const createdDrug = body.drug as Drug;
      setDrugs((current) => [...current, createdDrug].sort((left, right) =>
        Number(right.is_active) - Number(left.is_active) ||
        left.drug_name.localeCompare(right.drug_name) ||
        left.drug_id - right.drug_id,
      ));
      setFields(initialFields);
      setSuccess(`${createdDrug.drug_name} was added to the catalogue.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to add the drug.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivateDrug(drug: Drug) {
    if (submitting || deactivatingId !== null || !drug.is_active) return;
    setDeactivatingId(drug.drug_id);
    setActionError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/drugs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drug_id: drug.drug_id }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Unable to deactivate the drug."));
      if (!isRecord(body) || !isDrug(body.drug)) {
        throw new Error("The drug update response was invalid.");
      }

      const updatedDrug = body.drug as Drug;
      setDrugs((current) => current.map((item) => item.drug_id === drug.drug_id ? updatedDrug : item));
      setSuccess(`${drug.drug_name} was deactivated. The record remains in the catalogue.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to deactivate the drug.");
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={cardStyle} aria-labelledby="add-drug-heading">
        <h2 id="add-drug-heading" style={{ margin: "0 0 8px", fontSize: 20 }}>Add a drug</h2>
        <p style={{ margin: "0 0 18px", color: "#596579", lineHeight: 1.5 }}>
          New catalogue entries are active by default and available for prescribing.
        </p>

        <form onSubmit={addDrug}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 14 }}>
            {([
              ["drug_name", "Drug name", 160],
              ["generic_name", "Generic name", 160],
              ["drug_class", "Drug class", 120],
              ["form", "Form", 60],
              ["strength", "Strength", 60],
            ] as const).map(([field, label, maxLength]) => (
              <label key={field} style={{ display: "grid", gap: 6, color: "#344054", fontWeight: 600 }}>
                {label}
                <input
                  required
                  maxLength={maxLength}
                  value={fields[field]}
                  onChange={(event) => updateField(field, event.target.value)}
                  style={{ minHeight: 42, width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", font: "inherit", fontWeight: 400 }}
                />
              </label>
            ))}
            <label style={{ display: "grid", gap: 6, color: "#344054", fontWeight: 600 }}>
              Unit price (INR)
              <input
                required
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                inputMode="decimal"
                value={fields.unit_price}
                onChange={(event) => updateField("unit_price", event.target.value)}
                style={{ minHeight: 42, width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", font: "inherit", fontWeight: 400 }}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting || deactivatingId !== null}
            style={{ minHeight: 42, marginTop: 16, border: 0, borderRadius: 9, background: "#3157a4", color: "#fff", padding: "9px 15px", font: "inherit", fontWeight: 700, cursor: submitting || deactivatingId !== null ? "wait" : "pointer" }}
          >
            {submitting ? "Adding…" : "Add drug"}
          </button>
        </form>
      </section>

      {loadError && <p role="alert" style={{ ...cardStyle, color: "#a32020" }}>{loadError}</p>}
      {actionError && <p role="alert" style={{ ...cardStyle, color: "#a32020" }}>{actionError}</p>}
      {success && <p role="status" style={{ ...cardStyle, color: "#067647" }}>{success}</p>}

      <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }} aria-labelledby="drug-list-heading">
        <h2 id="drug-list-heading" style={{ margin: 0, padding: "22px 24px 14px", fontSize: 20 }}>Drug catalogue</h2>
        {loading ? (
          <p role="status" style={{ padding: "0 24px 22px", color: "#53627b" }}>Loading drug catalogue…</p>
        ) : loadError ? null : drugs.length === 0 ? (
          <p role="status" style={{ padding: "0 24px 22px", color: "#596579" }}>No drugs are in the catalogue yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
              <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>
                Drug catalogue and activation status
              </caption>
              <thead>
                <tr style={{ textAlign: "left", color: "#53627b", fontSize: 13 }}>
                  {["Drug", "Generic name", "Class", "Form", "Strength", "Unit price", "Status", "Action"].map((heading) => (
                    <th key={heading} scope="col" style={{ borderBottom: "1px solid #e2e8f0", padding: "11px 14px" }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drugs.map((drug) => (
                  <tr key={drug.drug_id}>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px", fontWeight: 600 }}>{drug.drug_name}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>{drug.generic_name}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>{drug.drug_class}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>{drug.form}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>{drug.strength}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px", whiteSpace: "nowrap" }}>{formatPrice(drug.unit_price)}</td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>
                      <span style={{ display: "inline-block", borderRadius: 999, padding: "5px 9px", background: drug.is_active ? "#ecfdf3" : "#f2f4f7", color: drug.is_active ? "#067647" : "#475467", fontSize: 13, fontWeight: 700 }}>
                        {drug.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ borderBottom: "1px solid #f0f2f5", padding: "12px 14px" }}>
                      {drug.is_active ? (
                        <button
                          type="button"
                          onClick={() => void deactivateDrug(drug)}
                          disabled={submitting || deactivatingId !== null}
                          aria-label={`Deactivate ${drug.drug_name}`}
                          style={{ minHeight: 38, border: "1px solid #b42318", borderRadius: 8, background: "#fff", color: "#b42318", padding: "7px 10px", font: "inherit", fontWeight: 600, cursor: submitting || deactivatingId !== null ? "wait" : "pointer" }}
                        >
                          {deactivatingId === drug.drug_id ? "Deactivating…" : "Deactivate"}
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
