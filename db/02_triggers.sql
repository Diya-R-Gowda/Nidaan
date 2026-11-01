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
        WHERE (di.drug_a_id = LEAST(NEW.drug_id, other_item.drug_id)
           AND di.drug_b_id = GREATEST(NEW.drug_id, other_item.drug_id));

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
