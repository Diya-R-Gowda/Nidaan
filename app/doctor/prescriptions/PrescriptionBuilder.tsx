"use client";

import { useRef, useState, type FormEvent } from "react";

type ConsultationOption = {
  consultation_id: number;
  appointment_id: number;
  appointment_time: string;
};

type DrugOption = {
  drug_id: number;
  drug_name: string;
  generic_name: string;
  form: string;
  strength: string;
};

type PrescriptionItemForm = {
  key: number;
  drug_id: string;
  drug_label: string;
  dose: string;
  frequency: string;
  duration_days: string;
  quantity: string;
};

type InteractionAlert = {
  key: string;
  severity: string;
  message: string;
  item_drug_name?: string;
  conflicting_drug_name?: string;
  item_ordinal?: number;
  conflicting_item_ordinal?: number | null;
  item_id?: number;
  conflicting_item_id?: number;
};

type PrescriptionBuilderProps = {
  consultations: ConsultationOption[];
  drugs: DrugOption[];
  loadError?: string;
  initialConsultationId?: number;
};

const fieldStyle = {
  width: "100%",
  minHeight: 44,
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  padding: "9px 11px",
  background: "#fff",
  color: "#172033",
  font: "inherit",
};

const labelStyle = {
  display: "grid",
  gap: 7,
  color: "#344054",
  fontSize: 14,
  fontWeight: 600,
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "#fff",
  padding: "20px clamp(16px, 4vw, 24px)",
  marginTop: 18,
};

function emptyItem(key: number): PrescriptionItemForm {
  return {
    key,
    drug_id: "",
    drug_label: "",
    dose: "",
    frequency: "",
    duration_days: "",
    quantity: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function drugOptionLabel(drug: DrugOption): string {
  return `${drug.drug_name} — ${drug.generic_name}, ${drug.strength}, ${drug.form} (ID ${drug.drug_id})`;
}

function positiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 2_147_483_647
    ? number
    : null;
}

function readAlerts(value: unknown): InteractionAlert[] {
  if (!isRecord(value) || !Array.isArray(value.interaction_alerts)) return [];

  return value.interaction_alerts.flatMap((alert, index) => {
    if (
      !isRecord(alert) ||
      typeof alert.severity !== "string" ||
      typeof alert.message !== "string"
    ) {
      return [];
    }
    return [{
      key: typeof alert.alert_id === "number"
        ? `alert-${alert.alert_id}`
        : `preview-${alert.item_ordinal ?? index}-${alert.conflicting_item_id ?? alert.conflicting_item_ordinal ?? index}`,
      severity: alert.severity,
      message: alert.message,
      item_drug_name: typeof alert.item_drug_name === "string" ? alert.item_drug_name : undefined,
      conflicting_drug_name: typeof alert.conflicting_drug_name === "string" ? alert.conflicting_drug_name : undefined,
      item_ordinal: typeof alert.item_ordinal === "number" ? alert.item_ordinal : undefined,
      conflicting_item_ordinal: typeof alert.conflicting_item_ordinal === "number"
        ? alert.conflicting_item_ordinal
        : alert.conflicting_item_ordinal === null ? null : undefined,
      item_id: typeof alert.item_id === "number" ? alert.item_id : undefined,
      conflicting_item_id: typeof alert.conflicting_item_id === "number"
        ? alert.conflicting_item_id
        : undefined,
    }];
  });
}

function prescriptionId(value: unknown): number | null {
  if (!isRecord(value) || !isRecord(value.prescription)) return null;
  return typeof value.prescription.prescription_id === "number"
    ? value.prescription.prescription_id
    : null;
}

export default function PrescriptionBuilder({
  consultations,
  drugs,
  loadError,
  initialConsultationId,
}: PrescriptionBuilderProps) {
  const [consultationId, setConsultationId] = useState(
    initialConsultationId ? String(initialConsultationId) : "",
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PrescriptionItemForm[]>([emptyItem(1)]);
  const nextItemKey = useRef(2);
  const submissionInProgress = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [alerts, setAlerts] = useState<InteractionAlert[]>([]);
  const [reviewToken, setReviewToken] = useState("");
  const [submissionAction, setSubmissionAction] = useState<"review" | "save" | null>(null);

  function invalidateInteractionReview() {
    setReviewToken("");
    setAlerts([]);
    setSuccessMessage("");
  }

  function updateItem(
    key: number,
    field: Exclude<keyof PrescriptionItemForm, "key">,
    value: string,
  ) {
    invalidateInteractionReview();
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;

        if (field === "drug_label") {
          const drug = drugs.find((option) => drugOptionLabel(option) === value);
          return {
            ...item,
            drug_label: value,
            drug_id: drug ? String(drug.drug_id) : "",
          };
        }

        return { ...item, [field]: value };
      }),
    );
  }

  function addItem() {
    if (items.length >= 100) return;

    invalidateInteractionReview();
    const key = nextItemKey.current;
    nextItemKey.current += 1;
    setItems((current) =>
      current.length >= 100 ? current : [...current, emptyItem(key)],
    );
  }

  function removeItem(key: number) {
    invalidateInteractionReview();
    setItems((current) => current.filter((item) => item.key !== key));
  }

  async function submitPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInProgress.current) return;

    setValidationError("");
    setSubmissionError("");
    if (!reviewToken) {
      setSuccessMessage("");
      setAlerts([]);
    }

    const selectedConsultationId = positiveInteger(consultationId);
    if (!selectedConsultationId) {
      setValidationError("Choose one of your consultations.");
      return;
    }
    if (items.length === 0) {
      setValidationError("Add at least one prescription item.");
      return;
    }

    const requestItems: Array<{
      drug_id: number;
      dose: string;
      frequency: string;
      duration_days: number;
      quantity: number;
    }> = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const drugId = positiveInteger(item.drug_id);
      const durationDays = positiveInteger(item.duration_days);
      const quantity = positiveInteger(item.quantity);

      if (!drugId || !drugs.some((drug) => drug.drug_id === drugId)) {
        setValidationError(`Choose an active drug for item ${index + 1}.`);
        return;
      }
      if (
        Array.from(item.dose.trim()).length === 0 ||
        Array.from(item.dose.trim()).length > 120
      ) {
        setValidationError(`Enter a dose of 1 to 120 characters for item ${index + 1}.`);
        return;
      }
      if (
        Array.from(item.frequency.trim()).length === 0 ||
        Array.from(item.frequency.trim()).length > 120
      ) {
        setValidationError(`Enter a frequency of 1 to 120 characters for item ${index + 1}.`);
        return;
      }
      if (!durationDays) {
        setValidationError(`Enter a valid positive whole number of days for item ${index + 1}.`);
        return;
      }
      if (!quantity) {
        setValidationError(`Enter a valid positive whole-number quantity for item ${index + 1}.`);
        return;
      }

      requestItems.push({
        drug_id: drugId,
        dose: item.dose.trim(),
        frequency: item.frequency.trim(),
        duration_days: durationDays,
        quantity,
      });
    }

    submissionInProgress.current = true;
    setSubmitting(true);
    const action = reviewToken ? "save" : "review";
    setSubmissionAction(action);
    try {
      const response = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          consultation_id: selectedConsultationId,
          notes: notes.trim() || null,
          items: requestItems,
          ...(action === "save" ? { interaction_review_token: reviewToken } : {}),
        }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const updatedReviewToken = isRecord(data) && typeof data.interaction_review_token === "string"
          ? data.interaction_review_token
          : "";
        if (response.status === 409 && updatedReviewToken) {
          setReviewToken(updatedReviewToken);
          setAlerts(readAlerts(data));
          setSubmissionError(apiError(
            data,
            "Interaction results changed. Review the updated results before saving.",
          ));
          return;
        }
        if (response.status === 409 && action === "save") {
          setReviewToken("");
          setAlerts([]);
        }
        throw new Error(apiError(data, "Unable to save this prescription."));
      }

      if (action === "review") {
        if (!isRecord(data) || typeof data.interaction_review_token !== "string") {
          throw new Error("Unable to verify the interaction review. Please try again.");
        }
        setReviewToken(data.interaction_review_token);
        setAlerts(readAlerts(data));
        setSuccessMessage("");
        return;
      }

      const id = prescriptionId(data);
      const returnedAlerts = readAlerts(data);
      setAlerts(returnedAlerts);
      setSuccessMessage(
        id
          ? `Prescription #${id} was saved successfully.`
          : "Prescription was saved successfully.",
      );
      setNotes("");
      setItems([emptyItem(nextItemKey.current)]);
      nextItemKey.current += 1;
      setReviewToken("");
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Unable to save this prescription.",
      );
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
      setSubmissionAction(null);
    }
  }

  const noticeStyle = {
    borderRadius: 9,
    padding: "11px 13px",
    fontSize: 14,
    lineHeight: 1.5,
  };

  return (
    <section style={cardStyle} aria-labelledby="prescription-form-title">
      {loadError && (
        <p role="alert" style={{ ...noticeStyle, background: "#fff1f0", color: "#a32020" }}>
          {loadError}
        </p>
      )}
      {!loadError && consultations.length === 0 && (
        <p role="status" style={{ ...noticeStyle, background: "#f8fafc", color: "#53627b" }}>
          No consultations are available for your doctor account yet.
        </p>
      )}
      {!loadError && consultations.length > 0 && drugs.length === 0 && (
        <p role="alert" style={{ ...noticeStyle, background: "#fff7e6", color: "#8a4b08" }}>
          No active drugs are available for prescribing.
        </p>
      )}

      <h2 id="prescription-form-title" style={{ margin: "0 0 20px", fontSize: 20 }}>
        Prescription details
      </h2>

      <form noValidate onSubmit={submitPrescription}>
        <fieldset
          disabled={Boolean(loadError) || consultations.length === 0 || drugs.length === 0 || submitting}
          style={{ border: 0, margin: 0, padding: 0 }}
        >
          <label style={labelStyle} htmlFor="consultation-id">
            Consultation
            <select
              id="consultation-id"
              value={consultationId}
              onChange={(event) => {
                invalidateInteractionReview();
                setConsultationId(event.target.value);
              }}
              style={fieldStyle}
            >
              <option value="">Select a consultation</option>
              {consultations.map((consultation) => (
                <option
                  key={consultation.consultation_id}
                  value={consultation.consultation_id}
                >
                  Consultation #{consultation.consultation_id} · Appointment #{consultation.appointment_id} · {consultation.appointment_time}
                </option>
              ))}
            </select>
          </label>

          <label style={{ ...labelStyle, marginTop: 18 }} htmlFor="prescription-notes">
            Prescription notes (optional)
            <textarea
              id="prescription-notes"
              value={notes}
              onChange={(event) => {
                invalidateInteractionReview();
                setNotes(event.target.value);
              }}
              rows={3}
              style={{ ...fieldStyle, minHeight: 88, resize: "vertical" }}
            />
          </label>

          <div style={{ marginTop: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17 }}>Prescription items</h3>
              <button
                type="button"
                onClick={addItem}
                disabled={items.length >= 100}
                aria-describedby={items.length >= 100 ? "prescription-item-limit" : undefined}
                style={{
                  border: "1px solid #3157a4",
                  borderRadius: 9,
                  background: "#fff",
                  color: "#3157a4",
                  padding: "9px 12px",
                  font: "inherit",
                  fontWeight: 700,
                  cursor: items.length >= 100 ? "not-allowed" : "pointer",
                }}
              >
                Add item
              </button>
            </div>
            {items.length >= 100 && (
              <p
                id="prescription-item-limit"
                role="status"
                aria-live="polite"
                style={{ color: "#8a4b08", fontSize: 14, margin: "0 0 12px" }}
              >
                This prescription has reached the 100-item limit. Remove an item before adding another.
              </p>
            )}

            <datalist id="available-drugs">
              {drugs.map((drug) => (
                <option key={drug.drug_id} value={drugOptionLabel(drug)} />
              ))}
            </datalist>

            <div style={{ display: "grid", gap: 14 }}>
              {items.map((item, index) => (
                <fieldset
                  key={item.key}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: "16px clamp(12px, 3vw, 20px) 18px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 14,
                  }}
                >
                  <legend style={{ padding: "0 6px", color: "#344054", fontWeight: 700 }}>
                    Item {index + 1}
                  </legend>
                  <label style={{ ...labelStyle, gridColumn: "1 / -1" }} htmlFor={`drug-${item.key}`}>
                    Drug
                    <input
                      id={`drug-${item.key}`}
                      list="available-drugs"
                      autoComplete="off"
                      value={item.drug_label}
                      onChange={(event) => updateItem(item.key, "drug_label", event.target.value)}
                      placeholder="Search active drugs by name, generic, strength, or form"
                      style={fieldStyle}
                    />
                  </label>
                  <label style={labelStyle} htmlFor={`dose-${item.key}`}>
                    Dose
                    <input
                      id={`dose-${item.key}`}
                      value={item.dose}
                      maxLength={120}
                      onChange={(event) => updateItem(item.key, "dose", event.target.value)}
                      placeholder="For example, 500 mg"
                      style={fieldStyle}
                    />
                  </label>
                  <label style={labelStyle} htmlFor={`frequency-${item.key}`}>
                    Frequency
                    <input
                      id={`frequency-${item.key}`}
                      value={item.frequency}
                      maxLength={120}
                      onChange={(event) => updateItem(item.key, "frequency", event.target.value)}
                      placeholder="For example, twice daily"
                      style={fieldStyle}
                    />
                  </label>
                  <label style={labelStyle} htmlFor={`duration-${item.key}`}>
                    Duration (days)
                    <input
                      id={`duration-${item.key}`}
                      type="number"
                      min={1}
                      max={2_147_483_647}
                      step={1}
                      value={item.duration_days}
                      onChange={(event) => updateItem(item.key, "duration_days", event.target.value)}
                      style={fieldStyle}
                    />
                  </label>
                  <label style={labelStyle} htmlFor={`quantity-${item.key}`}>
                    Quantity
                    <input
                      id={`quantity-${item.key}`}
                      type="number"
                      min={1}
                      max={2_147_483_647}
                      step={1}
                      value={item.quantity}
                      onChange={(event) => updateItem(item.key, "quantity", event.target.value)}
                      style={fieldStyle}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    disabled={items.length === 1}
                    aria-label={`Remove item ${index + 1}`}
                    style={{
                      alignSelf: "end",
                      minHeight: 42,
                      border: "1px solid #cbd5e1",
                      borderRadius: 9,
                      background: "#fff",
                      color: items.length === 1 ? "#98a2b3" : "#a32020",
                      padding: "8px 12px",
                      font: "inherit",
                      fontWeight: 600,
                      cursor: items.length === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Remove
                  </button>
                </fieldset>
              ))}
            </div>
          </div>
        </fieldset>

        {validationError && (
          <p role="alert" style={{ ...noticeStyle, marginTop: 18, background: "#fff7e6", color: "#8a4b08" }}>
            {validationError}
          </p>
        )}
        {submissionError && (
          <p role="alert" style={{ ...noticeStyle, marginTop: 18, background: "#fff1f0", color: "#a32020" }}>
            {submissionError}
          </p>
        )}
        {successMessage && (
          <p role="status" style={{ ...noticeStyle, marginTop: 18, background: "#ecfdf3", color: "#067647" }}>
            {successMessage}
          </p>
        )}
        {reviewToken && alerts.length === 0 && !successMessage && (
          <p role="status" style={{ ...noticeStyle, marginTop: 12, background: "#f8fafc", color: "#53627b" }}>
            No known interaction was found in this check. This does not guarantee that a prescription is safe.
          </p>
        )}
        {alerts.length > 0 && (
          <section
            role="status"
            aria-labelledby="interaction-alerts-title"
            style={{ ...noticeStyle, marginTop: 14, background: "#fff7e6", color: "#7a2e0e" }}
          >
            <h3 id="interaction-alerts-title" style={{ margin: "0 0 10px", fontSize: 16 }}>
              Review interaction warnings before saving
            </h3>
            <p style={{ margin: "0 0 10px" }}>
              These warnings support clinical review and are not a guarantee that a prescription is safe.
            </p>
            <ul style={{ display: "grid", gap: 8, margin: 0, paddingLeft: 22 }}>
              {alerts.map((alert) => (
                <li key={alert.key}>
                  <strong>{alert.severity}</strong>: {alert.item_drug_name && alert.conflicting_drug_name
                    ? `${alert.item_drug_name} with ${alert.conflicting_drug_name}. `
                    : ""}{alert.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {reviewToken && !successMessage && (
          <p role="status" style={{ ...noticeStyle, marginTop: 12, background: "#eff6ff", color: "#1e40af" }}>
            Review the interaction results above, then confirm to save this prescription.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || Boolean(loadError) || consultations.length === 0 || drugs.length === 0}
          style={{
            width: "100%",
            minHeight: 48,
            marginTop: 22,
            border: 0,
            borderRadius: 10,
            background: submitting ? "#7788ae" : "#3157a4",
            color: "#fff",
            font: "inherit",
            fontWeight: 700,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting
            ? submissionAction === "review" ? "Checking interactions…" : "Saving prescription…"
            : reviewToken ? "Confirm and save prescription" : "Check interactions"}
        </button>
      </form>
    </section>
  );
}
