-- Refreshable aggregate only; this migration does not alter clinical rows.
-- DROP intentionally omits CASCADE so unexpected dependent objects stop it.
BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.vw_drug_signal_rates;

CREATE MATERIALIZED VIEW public.vw_drug_signal_rates AS
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
FROM public.drug AS d
JOIN public.prescription_item AS pi ON pi.drug_id = d.drug_id
JOIN public.prescription AS p ON p.prescription_id = pi.prescription_id
JOIN public.consultation AS c ON c.consultation_id = p.consultation_id
JOIN public.appointment AS a ON a.appointment_id = c.appointment_id
LEFT JOIN public.ade_report AS r ON r.item_id = pi.item_id
GROUP BY d.drug_id, d.drug_name
HAVING COUNT(DISTINCT a.patient_id) >= 10;

COMMIT;
