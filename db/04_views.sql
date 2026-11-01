CREATE OR REPLACE VIEW vw_pending_reminders AS
SELECT reminder_id,
       appointment_id,
       recipient_type,
       channel,
       scheduled_for,
       sent_at,
       status,
       attempts
FROM reminder_queue
WHERE status = 'pending'
  AND sent_at IS NULL
  AND scheduled_for <= now() + INTERVAL '1 hour';
