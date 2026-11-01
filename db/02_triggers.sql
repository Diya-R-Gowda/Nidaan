CREATE OR REPLACE FUNCTION check_prescription_item_interactions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    patient_id_for_item INT;
    other_item RECORD;
    interaction RECORD;
BEGIN
    SELECT a.patient_id
    INTO patient_id_for_item
    FROM prescription p
    JOIN consultation c ON c.consultation_id = p.consultation_id
    JOIN appointment a ON a.appointment_id = c.appointment_id
    WHERE p.prescription_id = NEW.prescription_id;

    FOR other_item IN
        SELECT pi.item_id, pi.drug_id
        FROM prescription_item pi
        JOIN prescription p ON p.prescription_id = pi.prescription_id
        JOIN consultation c ON c.consultation_id = p.consultation_id
        JOIN appointment a ON a.appointment_id = c.appointment_id
        WHERE a.patient_id = patient_id_for_item
          AND pi.item_id <> NEW.item_id
    LOOP
        SELECT di.severity, di.mechanism, di.clinical_effect
        INTO interaction
        FROM drug_interaction di
        WHERE di.drug_a_id = LEAST(NEW.drug_id, other_item.drug_id)
          AND di.drug_b_id = GREATEST(NEW.drug_id, other_item.drug_id);

        IF FOUND THEN
            INSERT INTO interaction_alert (
                item_id,
                conflicting_item_id,
                severity,
                message
            ) VALUES (
                NEW.item_id,
                other_item.item_id,
                interaction.severity,
                format(
                    'Interaction detected: %s. Clinical effect: %s',
                    interaction.mechanism,
                    interaction.clinical_effect
                )
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_interaction
AFTER INSERT ON prescription_item
FOR EACH ROW
EXECUTE FUNCTION check_prescription_item_interactions();

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

CREATE OR REPLACE FUNCTION audit_prescription_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO audit_log (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        TG_OP,
        'prescription',
        NEW.prescription_id,
        jsonb_build_object(
            'consultation_id', NEW.consultation_id,
            'issued_at', NEW.issued_at,
            'notes', NEW.notes
        )
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_prescription
AFTER INSERT OR UPDATE ON prescription
FOR EACH ROW
EXECUTE FUNCTION audit_prescription_change();
