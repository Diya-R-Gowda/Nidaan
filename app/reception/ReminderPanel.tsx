"use client";

import { useEffect, useState } from "react";

type Reminder = {
  reminder_id: number;
  appointment_id: number;
  recipient_type: string;
  channel: string;
  scheduled_for: string;
  sent_at: string | null;
  status: string;
  attempts: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReminder(value: unknown): value is Reminder {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.reminder_id) &&
    Number.isSafeInteger(value.appointment_id) &&
    typeof value.recipient_type === "string" &&
    typeof value.channel === "string" &&
    typeof value.scheduled_for === "string" &&
    (typeof value.sent_at === "string" || value.sent_at === null) &&
    typeof value.status === "string" &&
    (typeof value.attempts === "number" || value.attempts === null)
  );
}

function responseError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function displayDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: "24px clamp(18px, 4vw, 30px)",
  boxShadow: "0 12px 32px rgba(22, 34, 57, 0.05)",
};

export default function ReminderPanel() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [recentlyMarked, setRecentlyMarked] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [updatingReminderId, setUpdatingReminderId] = useState<number | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadReminders() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/reminders", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(responseError(data, "Unable to load pending reminders."));
        }
        if (
          !isRecord(data) ||
          !Array.isArray(data.reminders) ||
          !data.reminders.every(isReminder)
        ) {
          throw new Error("The pending reminders response was invalid.");
        }

        setReminders(data.reminders);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load pending reminders.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadReminders();
    return () => controller.abort();
  }, [refreshVersion]);

  async function markAsSent(reminderId: number) {
    if (updatingReminderId !== null) return;

    setUpdatingReminderId(reminderId);
    setActionError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminder_id: reminderId }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (response.status === 404) {
        setReminders((current) => current.filter((reminder) => reminder.reminder_id !== reminderId));
        setActionError("This reminder no longer exists. Refresh the list to check for updates.");
        return;
      }
      if (response.status === 409) {
        setReminders((current) => current.filter((reminder) => reminder.reminder_id !== reminderId));
        setActionError(
          "This reminder is no longer pending or has already been marked as sent. Refresh the list to check for updates.",
        );
        return;
      }
      if (!response.ok) {
        throw new Error(responseError(data, "Unable to update this reminder."));
      }
      if (!isRecord(data) || !isReminder(data.reminder)) {
        throw new Error("The reminder update response was invalid.");
      }

      const updatedReminder = data.reminder;
      setReminders((current) => current.filter((reminder) => reminder.reminder_id !== reminderId));
      setRecentlyMarked((current) => [
        updatedReminder,
        ...current.filter((reminder) => reminder.reminder_id !== reminderId),
      ]);
      setSuccessMessage(
        `Reminder #${updatedReminder.reminder_id} was marked as sent in the system. No SMS or email was delivered by this action.`,
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to update this reminder.",
      );
    } finally {
      setUpdatingReminderId(null);
    }
  }

  return (
    <section style={cardStyle} aria-labelledby="reminder-panel-title">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "start",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div>
          <h2 id="reminder-panel-title" style={{ margin: 0, fontSize: 21 }}>
            Pending reminders
          </h2>
          <p style={{ margin: "8px 0 0", color: "#596579", lineHeight: 1.5 }}>
            Showing reminders scheduled in the next hour. Times are shown in India Standard Time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshVersion((version) => version + 1)}
          disabled={loading || updatingReminderId !== null}
          style={{
            minHeight: 42,
            border: "1px solid #cbd5e1",
            borderRadius: 9,
            background: "#fff",
            color: "#344054",
            padding: "8px 12px",
            font: "inherit",
            fontWeight: 600,
            cursor: loading || updatingReminderId !== null ? "not-allowed" : "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      <p style={{ color: "#53627b", fontSize: 13, lineHeight: 1.5 }}>
        Marking a reminder updates its status only. This panel does not send SMS or email notifications.
      </p>

      {loading && (
        <p role="status" style={{ color: "#53627b" }}>
          Loading pending reminders…
        </p>
      )}
      {loadError && (
        <p role="alert" style={{ color: "#a32020" }}>
          {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" style={{ color: "#a32020" }}>
          {actionError}
        </p>
      )}
      {successMessage && (
        <p role="status" style={{ color: "#067647" }}>
          {successMessage}
        </p>
      )}

      {!loading && !loadError && reminders.length === 0 && (
        <p role="status" style={{ color: "#53627b", marginBottom: 0 }}>
          No pending reminders are due within the next hour.
        </p>
      )}

      {!loading && !loadError && reminders.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>
              Pending reminder queue due within the next hour
            </caption>
            <thead>
              <tr style={{ textAlign: "left", color: "#53627b", fontSize: 13 }}>
                {[
                  "Appointment",
                  "Recipient",
                  "Channel",
                  "Scheduled time",
                  "Status",
                  "Attempts",
                  "Action",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    style={{ borderBottom: "1px solid #e2e8f0", padding: "10px 12px" }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reminders.map((reminder) => (
                <tr key={reminder.reminder_id}>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 12px", fontWeight: 600 }}>
                    #{reminder.appointment_id}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 12px", textTransform: "capitalize" }}>
                    {humanize(reminder.recipient_type)}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 12px", textTransform: "capitalize" }}>
                    {humanize(reminder.channel)}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 12px" }}>
                    {displayDateTime(reminder.scheduled_for)}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 12px", textTransform: "capitalize" }}>
                    {humanize(reminder.status)}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 12px" }}>
                    {reminder.attempts ?? "—"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f2f5", padding: "13px 12px" }}>
                    <button
                      type="button"
                      onClick={() => void markAsSent(reminder.reminder_id)}
                      disabled={updatingReminderId !== null}
                      aria-label={`Mark reminder ${reminder.reminder_id} for appointment ${reminder.appointment_id} as sent`}
                      style={{
                        minHeight: 40,
                        border: 0,
                        borderRadius: 8,
                        background: updatingReminderId === reminder.reminder_id ? "#7788ae" : "#3157a4",
                        color: "#fff",
                        padding: "8px 11px",
                        font: "inherit",
                        fontWeight: 700,
                        cursor: updatingReminderId !== null ? "wait" : "pointer",
                      }}
                    >
                      {updatingReminderId === reminder.reminder_id ? "Updating…" : "Mark as sent"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recentlyMarked.length > 0 && (
        <section aria-labelledby="recently-marked-title" style={{ marginTop: 26 }}>
          <h3 id="recently-marked-title" style={{ fontSize: 17, margin: "0 0 10px" }}>
            Marked as sent during this visit
          </h3>
          <ul style={{ margin: 0, paddingLeft: 22, color: "#344054" }}>
            {recentlyMarked.map((reminder) => (
              <li key={reminder.reminder_id} style={{ margin: "6px 0" }}>
                Appointment #{reminder.appointment_id} · {humanize(reminder.recipient_type)} · {humanize(reminder.status)} · {displayDateTime(reminder.sent_at ?? reminder.scheduled_for)} · Attempts: {reminder.attempts ?? "—"}
              </li>
            ))}
          </ul>
          <p style={{ color: "#667085", fontSize: 13, lineHeight: 1.5 }}>
            This temporary list uses the successful POST responses. The pending-reminders endpoint does not provide sent-history data after refresh.
          </p>
        </section>
      )}
    </section>
  );
}
