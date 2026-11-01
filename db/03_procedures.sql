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
