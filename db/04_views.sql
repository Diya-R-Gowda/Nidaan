CREATE MATERIALIZED VIEW vw_drug_signal_rates AS
SELECT
    d.drug_id,
    d.drug_name,
    COUNT(DISTINCT a.patient_id) AS patients_exposed,
    COUNT(DISTINCT r.report_id) AS adverse_events,
    ROUND(
        COUNT(DISTINCT r.report_id) * 100.0
        / NULLIF(COUNT(DISTINCT a.patient_id), 0),
        2
    ) AS rate_per_100
FROM drug d
JOIN prescription_item pi ON pi.drug_id = d.drug_id
JOIN prescription p ON p.prescription_id = pi.prescription_id
JOIN consultation c ON c.consultation_id = p.consultation_id
JOIN appointment a ON a.appointment_id = c.appointment_id
LEFT JOIN ade_report r ON r.item_id = pi.item_id
GROUP BY d.drug_id, d.drug_name;

CREATE VIEW vw_doctor_schedule AS
SELECT
    a.appointment_id,
    a.doctor_id,
    u.full_name AS doctor_name,
    a.patient_id,
    p.full_name AS patient_name,
    a.slot_start,
    a.slot_end,
    a.mode,
    a.meeting_link,
    a.status AS appointment_status,
    c.consultation_id,
    c.started_at AS consultation_started_at,
    c.ended_at AS consultation_ended_at
FROM appointment a
JOIN doctor d ON d.doctor_id = a.doctor_id
JOIN user_account u ON u.user_id = d.user_id
JOIN patient p ON p.patient_id = a.patient_id
LEFT JOIN consultation c ON c.appointment_id = a.appointment_id
WHERE a.slot_start >= now()
  AND a.status IN ('booked', 'confirmed');

CREATE OR REPLACE VIEW vw_pending_reminders AS
SELECT
    rq.reminder_id,
    rq.appointment_id,
    rq.recipient_type,
    rq.channel,
    rq.scheduled_for,
    rq.status,
    rq.attempts,
    rq.sent_at
FROM reminder_queue rq
WHERE rq.status = 'pending'
  AND rq.sent_at IS NULL
  AND rq.scheduled_for >= now()
  AND rq.scheduled_for < now() + INTERVAL '1 hour';
