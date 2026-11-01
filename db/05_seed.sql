INSERT INTO drug (
    drug_id,
    drug_name,
    generic_name,
    drug_class,
    form,
    strength,
    unit_price,
    is_active
) VALUES
    (1, 'Warfarin 5 mg Tablet', 'Warfarin', 'Anticoagulant', 'Tablet', '5 mg', 12.50, TRUE),
    (2, 'Aspirin 75 mg Tablet', 'Aspirin', 'Antiplatelet', 'Tablet', '75 mg', 3.25, TRUE),
    (3, 'Ibuprofen 400 mg Tablet', 'Ibuprofen', 'NSAID', 'Tablet', '400 mg', 4.00, TRUE),
    (4, 'Amoxicillin 500 mg Capsule', 'Amoxicillin', 'Penicillin antibiotic', 'Capsule', '500 mg', 8.50, TRUE),
    (5, 'Azithromycin 500 mg Tablet', 'Azithromycin', 'Macrolide antibiotic', 'Tablet', '500 mg', 18.00, TRUE),
    (6, 'Metformin 500 mg Tablet', 'Metformin', 'Biguanide antidiabetic', 'Tablet', '500 mg', 5.50, TRUE),
    (7, 'Insulin Glargine 100 units/mL', 'Insulin glargine', 'Long-acting insulin', 'Injection', '100 units/mL', 425.00, TRUE),
    (8, 'Amlodipine 5 mg Tablet', 'Amlodipine', 'Calcium-channel blocker', 'Tablet', '5 mg', 6.75, TRUE),
    (9, 'Lisinopril 10 mg Tablet', 'Lisinopril', 'ACE inhibitor', 'Tablet', '10 mg', 7.25, TRUE),
    (10, 'Atorvastatin 20 mg Tablet', 'Atorvastatin', 'Statin', 'Tablet', '20 mg', 9.50, TRUE),
    (11, 'Omeprazole 20 mg Capsule', 'Omeprazole', 'Proton-pump inhibitor', 'Capsule', '20 mg', 6.00, TRUE),
    (12, 'Levothyroxine 50 mcg Tablet', 'Levothyroxine', 'Thyroid hormone', 'Tablet', '50 mcg', 5.75, TRUE),
    (13, 'Salbutamol 100 mcg Inhaler', 'Salbutamol', 'Bronchodilator', 'Inhaler', '100 mcg/dose', 95.00, TRUE),
    (14, 'Prednisolone 10 mg Tablet', 'Prednisolone', 'Corticosteroid', 'Tablet', '10 mg', 8.25, TRUE),
    (15, 'Fluconazole 150 mg Tablet', 'Fluconazole', 'Antifungal', 'Tablet', '150 mg', 22.00, TRUE),
    (16, 'Clopidogrel 75 mg Tablet', 'Clopidogrel', 'Antiplatelet', 'Tablet', '75 mg', 14.50, TRUE),
    (17, 'Furosemide 40 mg Tablet', 'Furosemide', 'Loop diuretic', 'Tablet', '40 mg', 4.75, TRUE),
    (18, 'Sertraline 50 mg Tablet', 'Sertraline', 'SSRI antidepressant', 'Tablet', '50 mg', 11.00, TRUE),
    (19, 'Tramadol 50 mg Tablet', 'Tramadol', 'Opioid analgesic', 'Tablet', '50 mg', 13.00, TRUE),
    (20, 'Digoxin 0.125 mg Tablet', 'Digoxin', 'Cardiac glycoside', 'Tablet', '0.125 mg', 10.25, TRUE);

SELECT setval(
    pg_get_serial_sequence('drug', 'drug_id'),
    (SELECT MAX(drug_id) FROM drug)
);

INSERT INTO drug_interaction (
    drug_a_id,
    drug_b_id,
    severity,
    mechanism,
    clinical_effect,
    reference_source
) VALUES
    (1, 2, 'major', 'Additive inhibition of haemostasis',
     'Increased risk of serious bleeding', 'BNF drug interaction guidance'),
    (1, 3, 'major', 'NSAID-related platelet inhibition and gastric injury',
     'Increased risk of gastrointestinal and systemic bleeding', 'FDA prescribing information'),
    (1, 5, 'major', 'Macrolide inhibition of warfarin metabolism',
     'Elevated INR and increased bleeding risk', 'Drug interaction reference'),
    (1, 15, 'major', 'CYP2C9 inhibition reduces warfarin clearance',
     'Markedly increased anticoagulant effect', 'Drug interaction reference'),
    (1, 18, 'moderate', 'Additive effects on platelet function',
     'Increased bruising and bleeding risk', 'Drug interaction reference'),
    (2, 16, 'major', 'Additive antiplatelet activity',
     'Increased risk of bleeding', 'Drug interaction reference'),
    (3, 9, 'moderate', 'NSAID inhibition of renal prostaglandins',
     'Reduced antihypertensive effect and kidney injury risk', 'Drug interaction reference'),
    (5, 10, 'moderate', 'Both agents may prolong cardiac repolarisation',
     'Increased risk of QT prolongation and arrhythmia', 'Drug interaction reference'),
    (6, 7, 'moderate', 'Additive glucose-lowering activity',
     'Increased risk of hypoglycaemia', 'Drug interaction reference'),
    (18, 19, 'major', 'Serotonergic activity from both medicines',
     'Potentially life-threatening serotonin syndrome', 'Drug interaction reference');
