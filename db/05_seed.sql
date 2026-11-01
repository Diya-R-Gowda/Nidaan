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

INSERT INTO patient (
    patient_id,
    full_name,
    date_of_birth,
    sex,
    phone,
    email,
    blood_group,
    registered_at
) VALUES
    (1, 'Aarav Sharma', '1998-04-12', 'male', '+91-9000000001', 'aarav.sharma@example.com', 'O+', '2026-01-08 09:15:00+05:30'),
    (2, 'Ananya Rao', '2002-11-03', 'female', '+91-9000000002', 'ananya.rao@example.com', 'A+', '2026-01-09 10:30:00+05:30'),
    (3, 'Vikram Iyer', '1975-07-19', 'male', '+91-9000000003', 'vikram.iyer@example.com', 'B+', '2026-01-10 11:00:00+05:30'),
    (4, 'Meera Nair', '1988-02-25', 'female', '+91-9000000004', 'meera.nair@example.com', 'AB+', '2026-01-12 14:20:00+05:30'),
    (5, 'Rohan Desai', '2010-09-14', 'male', '+91-9000000005', 'rohan.desai@example.com', 'O-', '2026-01-13 15:10:00+05:30'),
    (6, 'Kavya Menon', '1995-06-08', 'female', '+91-9000000006', 'kavya.menon@example.com', 'A-', '2026-01-15 09:45:00+05:30'),
    (7, 'Suresh Kulkarni', '1952-12-01', 'male', '+91-9000000007', 'suresh.kulkarni@example.com', 'B+', '2026-01-16 10:15:00+05:30'),
    (8, 'Fatima Sheikh', '1960-03-22', 'female', '+91-9000000008', 'fatima.sheikh@example.com', 'O+', '2026-01-18 12:00:00+05:30'),
    (9, 'Nikhil Bhat', '1982-10-30', 'male', '+91-9000000009', 'nikhil.bhat@example.com', 'AB-', '2026-01-20 16:30:00+05:30'),
    (10, 'Priya Krishnan', '1970-01-17', 'female', '+91-9000000010', 'priya.krishnan@example.com', 'A+', '2026-01-21 09:00:00+05:30'),
    (11, 'Aditya Joshi', '1991-05-05', 'male', '+91-9000000011', 'aditya.joshi@example.com', 'B-', '2026-01-23 11:45:00+05:30'),
    (12, 'Lakshmi Hegde', '1948-08-11', 'female', '+91-9000000012', 'lakshmi.hegde@example.com', 'O+', '2026-01-24 13:15:00+05:30'),
    (13, 'Arjun Pillai', '2005-12-27', 'male', '+91-9000000013', 'arjun.pillai@example.com', 'A+', '2026-01-26 15:45:00+05:30'),
    (14, 'Sneha Kapoor', '1985-09-09', 'female', '+91-9000000014', 'sneha.kapoor@example.com', 'AB+', '2026-01-27 10:00:00+05:30'),
    (15, 'Mohan Reddy', '1939-06-16', 'male', '+91-9000000015', 'mohan.reddy@example.com', 'B+', '2026-01-29 09:30:00+05:30'),
    (16, 'Ishita Sen', '1999-03-03', 'female', '+91-9000000016', 'ishita.sen@example.com', 'O-', '2026-02-01 14:00:00+05:30'),
    (17, 'Rahul Verma', '1965-11-21', 'male', '+91-9000000017', 'rahul.verma@example.com', 'A-', '2026-02-03 16:15:00+05:30'),
    (18, 'Divya Thomas', '1978-04-28', 'female', '+91-9000000018', 'divya.thomas@example.com', 'B+', '2026-02-05 11:30:00+05:30'),
    (19, 'Kabir Malhotra', '2015-07-07', 'male', '+91-9000000019', 'kabir.malhotra@example.com', 'O+', '2026-02-07 10:45:00+05:30'),
    (20, 'Geeta Prasad', '1957-02-13', 'female', '+91-9000000020', 'geeta.prasad@example.com', 'AB+', '2026-02-09 13:00:00+05:30'),
    (21, 'Manish Choudhary', '1989-12-18', 'male', '+91-9000000021', 'manish.choudhary@example.com', 'A+', '2026-02-11 15:30:00+05:30'),
    (22, 'Pooja Banerjee', '1993-08-26', 'female', '+91-9000000022', 'pooja.banerjee@example.com', 'B+', '2026-02-13 09:15:00+05:30'),
    (23, 'Harish Gowda', '1945-05-31', 'male', '+91-9000000023', 'harish.gowda@example.com', 'O+', '2026-02-15 10:30:00+05:30'),
    (24, 'Neha Agarwal', '2000-01-06', 'female', '+91-9000000024', 'neha.agarwal@example.com', 'A+', '2026-02-17 12:45:00+05:30'),
    (25, 'Joseph Mathew', '1968-10-12', 'male', '+91-9000000025', 'joseph.mathew@example.com', 'AB-', '2026-02-19 14:15:00+05:30'),
    (26, 'Shreya Murthy', '1980-06-24', 'female', '+91-9000000026', 'shreya.murthy@example.com', 'O-', '2026-02-21 16:00:00+05:30'),
    (27, 'Yash Patil', '2008-02-09', 'male', '+91-9000000027', 'yash.patil@example.com', 'B+', '2026-02-23 11:00:00+05:30'),
    (28, 'Nandini Das', '1959-09-02', 'female', '+91-9000000028', 'nandini.das@example.com', 'A-', '2026-02-25 09:45:00+05:30'),
    (29, 'Sameer Khan', '1972-11-15', 'male', '+91-9000000029', 'sameer.khan@example.com', 'O+', '2026-02-27 13:30:00+05:30'),
    (30, 'Asha Fernandes', '1942-12-29', 'female', '+91-9000000030', 'asha.fernandes@example.com', 'B-', '2026-03-01 15:00:00+05:30');

SELECT setval(
    pg_get_serial_sequence('patient', 'patient_id'),
    (SELECT MAX(patient_id) FROM patient)
);

INSERT INTO ade_report (
    patient_id,
    item_id,
    narrative,
    onset_date,
    reported_at,
    reported_by,
    status
) VALUES
    (1, NULL, 'The patient developed bleeding gums and purple patches on arms after starting treatment.', '2026-02-04', '2026-02-06 09:20:00+05:30', 1, 'new'),
    (2, NULL, 'The patient noticed blood while brushing teeth, unusual bruising, and persistent tiredness.', '2026-02-07', '2026-02-09 11:10:00+05:30', 1, 'new'),
    (3, NULL, 'A mild itchy rash appeared across the chest and upper back two days after the medicine.', '2026-02-10', '2026-02-12 15:40:00+05:30', 1, 'new'),
    (4, NULL, 'The patient reported nausea, reduced appetite, and stomach discomfort after each morning dose.', '2026-02-13', '2026-02-15 10:05:00+05:30', 1, 'new'),
    (5, NULL, 'The patient experienced dizziness when standing and briefly felt faint during an afternoon walk.', '2026-02-16', '2026-02-17 13:25:00+05:30', 1, 'new'),
    (6, NULL, 'Swelling around both ankles developed gradually, with tight shoes by the end of the day.', '2026-02-18', '2026-02-20 09:50:00+05:30', 1, 'new'),
    (7, NULL, 'The patient developed wheezing and shortness of breath shortly after taking the new tablet.', '2026-02-21', '2026-02-21 17:15:00+05:30', 1, 'new'),
    (8, NULL, 'A widespread red rash with small raised spots appeared on the arms and abdomen.', '2026-02-23', '2026-02-25 12:35:00+05:30', 1, 'new'),
    (9, NULL, 'The patient reported severe headache, blurred vision, and difficulty concentrating at work.', '2026-02-26', '2026-02-28 16:20:00+05:30', 1, 'new'),
    (10, NULL, 'The patient had repeated loose stools and abdominal cramping beginning the evening after treatment.', '2026-03-01', '2026-03-02 10:45:00+05:30', 1, 'new'),
    (11, NULL, 'There was facial swelling and throat tightness with difficulty breathing after the first dose.', '2026-03-03', '2026-03-03 14:10:00+05:30', 1, 'new'),
    (12, NULL, 'The patient noticed dark urine, unusual weakness, and yellowing of the eyes over several days.', '2026-03-05', '2026-03-08 09:35:00+05:30', 1, 'new'),
    (13, NULL, 'The patient experienced trembling hands, sweating, and a rapid heartbeat after the evening dose.', '2026-03-09', '2026-03-10 11:55:00+05:30', 1, 'new'),
    (14, NULL, 'A painful burning sensation and numbness developed in both feet after continued medication use.', '2026-03-12', '2026-03-15 15:05:00+05:30', 1, 'new'),
    (15, NULL, 'The patient reported constipation, dry mouth, and increasing drowsiness that affected daily activities.', '2026-03-17', '2026-03-18 13:40:00+05:30', 1, 'new');
