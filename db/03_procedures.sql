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
