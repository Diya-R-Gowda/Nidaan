CREATE OR REPLACE FUNCTION trg_queue_reminders_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE reminder_queue
    SET channel = 'in_app',
        scheduled_for = NEW.slot_start - INTERVAL '24 hours',
        sent_at = NULL,
        status = 'pending',
        attempts = 0
    WHERE appointment_id = NEW.appointment_id
      AND recipient_type IN ('patient', 'doctor');

    INSERT INTO reminder_queue (
        appointment_id,
        recipient_type,
        channel,
        scheduled_for,
        sent_at,
        status,
        attempts
    )
    SELECT NEW.appointment_id,
           recipient.recipient_type,
           'in_app',
           NEW.slot_start - INTERVAL '24 hours',
           NULL,
           'pending',
           0
    FROM (VALUES ('patient'::VARCHAR(20)), ('doctor'::VARCHAR(20)))
         AS recipient(recipient_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM reminder_queue AS existing
        WHERE existing.appointment_id = NEW.appointment_id
          AND existing.recipient_type = recipient.recipient_type
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_reminders
AFTER UPDATE OF status ON appointment
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'confirmed')
EXECUTE FUNCTION trg_queue_reminders_fn();
