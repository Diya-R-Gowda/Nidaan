CREATE OR REPLACE FUNCTION fn_compute_invoice(p_consultation_id INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    invoice_id_result INT;
    issuing_user_id INT;
    consultation_fee_amount NUMERIC(10, 2);
    drug_subtotal NUMERIC(10, 2);
    subtotal_amount NUMERIC(10, 2);
    tax_amount_result NUMERIC(10, 2);
    total_amount NUMERIC(10, 2);
    tax_rate CONSTANT NUMERIC(5, 4) := 0.1800;
BEGIN
    SELECT u.user_id, d.consultation_fee
    INTO issuing_user_id, consultation_fee_amount
    FROM consultation c
    JOIN appointment a ON a.appointment_id = c.appointment_id
    JOIN doctor d ON d.doctor_id = a.doctor_id
    JOIN user_account u ON u.user_id = d.user_id
    WHERE c.consultation_id = p_consultation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Consultation % does not exist', p_consultation_id;
    END IF;

    SELECT COALESCE(SUM(pi.quantity * d.unit_price), 0)
    INTO drug_subtotal
    FROM prescription p
    JOIN prescription_item pi ON pi.prescription_id = p.prescription_id
    JOIN drug d ON d.drug_id = pi.drug_id
    WHERE p.consultation_id = p_consultation_id;

    subtotal_amount := consultation_fee_amount + drug_subtotal;
    tax_amount_result := ROUND(subtotal_amount * tax_rate, 2);
    total_amount := subtotal_amount + tax_amount_result;

    INSERT INTO invoice (
        consultation_id,
        issued_by,
        subtotal,
        tax_amount,
        total,
        status
    ) VALUES (
        p_consultation_id,
        issuing_user_id,
        subtotal_amount,
        tax_amount_result,
        total_amount,
        'issued'
    )
    RETURNING invoice_id INTO invoice_id_result;

    INSERT INTO invoice_line (
        invoice_id,
        line_type,
        description,
        quantity,
        unit_price,
        line_total
    ) VALUES (
        invoice_id_result,
        'consultation',
        'Doctor consultation fee',
        1,
        consultation_fee_amount,
        consultation_fee_amount
    );

    INSERT INTO invoice_line (
        invoice_id,
        line_type,
        description,
        quantity,
        unit_price,
        line_total
    )
    SELECT
        invoice_id_result,
        'drug',
        d.drug_name,
        pi.quantity,
        d.unit_price,
        pi.quantity * d.unit_price
    FROM prescription p
    JOIN prescription_item pi ON pi.prescription_id = p.prescription_id
    JOIN drug d ON d.drug_id = pi.drug_id
    WHERE p.consultation_id = p_consultation_id;

    RETURN invoice_id_result;
END;
$$;

CREATE OR REPLACE FUNCTION fn_signal_rate(
    p_drug_id INT,
    p_from_date DATE,
    p_to_date DATE
)
RETURNS TABLE (
    reports BIGINT,
    exposed_patients BIGINT,
    rate_per_100 NUMERIC
)
LANGUAGE SQL
AS $$
    WITH exposure AS (
        SELECT COUNT(DISTINCT a.patient_id) AS exposed_patients
        FROM prescription_item pi
        JOIN prescription p ON p.prescription_id = pi.prescription_id
        JOIN consultation c ON c.consultation_id = p.consultation_id
        JOIN appointment a ON a.appointment_id = c.appointment_id
        WHERE pi.drug_id = p_drug_id
          AND p.issued_at >= p_from_date
          AND p.issued_at < p_to_date + INTERVAL '1 day'
    ),
    adverse_events AS (
        SELECT COUNT(DISTINCT r.report_id) AS reports
        FROM ade_report r
        JOIN prescription_item pi ON pi.item_id = r.item_id
        WHERE pi.drug_id = p_drug_id
          AND r.reported_at >= p_from_date
          AND r.reported_at < p_to_date + INTERVAL '1 day'
    )
    SELECT
        adverse_events.reports,
        exposure.exposed_patients,
        ROUND(
            adverse_events.reports * 100.0
            / NULLIF(exposure.exposed_patients, 0),
            2
        ) AS rate_per_100
    FROM exposure
    CROSS JOIN adverse_events;
$$;

CREATE OR REPLACE FUNCTION fn_severity_score(p_report_id INT)
RETURNS NUMERIC(4, 2)
LANGUAGE plpgsql
AS $$
DECLARE
    report_narrative TEXT;
    patient_birth_date DATE;
    report_item_drug_id INT;
    score NUMERIC(4, 2) := 0;
    interaction_severity VARCHAR(20);
BEGIN
    SELECT r.narrative, p.date_of_birth, pi.drug_id
    INTO report_narrative, patient_birth_date, report_item_drug_id
    FROM ade_report r
    JOIN patient p ON p.patient_id = r.patient_id
    LEFT JOIN prescription_item pi ON pi.item_id = r.item_id
    WHERE r.report_id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADE report % does not exist', p_report_id;
    END IF;

    -- Longer narratives usually contain more clinical detail.
    IF char_length(report_narrative) >= 100 THEN
        score := score + 2;
    END IF;

    -- Flag terms indicate potentially serious symptoms.
    IF report_narrative ~* '(bleed|haemorrhage|hemorrhage|anaphylaxis|faint|breathless|unconscious)' THEN
        score := score + 3;
    END IF;

    -- Older patients receive one additional risk point.
    IF date_part('year', age(CURRENT_DATE, patient_birth_date)) >= 65 THEN
        score := score + 1;
    END IF;

    -- Use the most severe interaction involving the suspected drug.
    SELECT CASE
        WHEN bool_or(di.severity = 'major') THEN 'major'
        WHEN bool_or(di.severity = 'moderate') THEN 'moderate'
        ELSE NULL
    END
    INTO interaction_severity
    FROM prescription_item pi
    JOIN prescription pr ON pr.prescription_id = pi.prescription_id
    JOIN consultation c ON c.consultation_id = pr.consultation_id
    JOIN appointment a ON a.appointment_id = c.appointment_id
    JOIN drug_interaction di
      ON di.drug_a_id = LEAST(report_item_drug_id, pi.drug_id)
     AND di.drug_b_id = GREATEST(report_item_drug_id, pi.drug_id)
    WHERE a.patient_id = (
        SELECT patient_id
        FROM ade_report
        WHERE report_id = p_report_id
    )
      AND report_item_drug_id IS NOT NULL
      AND pi.drug_id <> report_item_drug_id;

    IF interaction_severity = 'major' THEN
        score := score + 3;
    ELSIF interaction_severity = 'moderate' THEN
        score := score + 1;
    END IF;

    RETURN LEAST(score, 10.00);
END;
$$;
