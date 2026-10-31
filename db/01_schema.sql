CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE user_account (
    user_id       SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    role          VARCHAR(30) NOT NULL
                  CHECK (role IN ('receptionist', 'prescriber',
                                  'pharmacovigilance', 'admin')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doctor (
    doctor_id        SERIAL PRIMARY KEY,
    user_id          INT NOT NULL UNIQUE
                     REFERENCES user_account(user_id) ON DELETE RESTRICT,
    registration_no  VARCHAR(60) NOT NULL UNIQUE,
    specialisation   VARCHAR(120) NOT NULL,
    consultation_fee NUMERIC(10, 2) NOT NULL CHECK (consultation_fee >= 0)
);

CREATE TABLE patient (
    patient_id   SERIAL PRIMARY KEY,
    full_name    VARCHAR(120) NOT NULL,
    date_of_birth DATE NOT NULL,
    sex          VARCHAR(20) NOT NULL,
    phone        VARCHAR(30) NOT NULL,
    email        VARCHAR(255),
    blood_group  VARCHAR(10),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patient_allergy (
    allergy_id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL
               REFERENCES patient(patient_id) ON DELETE RESTRICT,
    substance  VARCHAR(120) NOT NULL,
    severity   VARCHAR(20) NOT NULL,
    noted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (patient_id, substance)
);

CREATE TABLE appointment (
    appointment_id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL
        REFERENCES patient(patient_id) ON DELETE RESTRICT,
    doctor_id INT NOT NULL
        REFERENCES doctor(doctor_id) ON DELETE RESTRICT,
    created_by INT NOT NULL
        REFERENCES user_account(user_id) ON DELETE RESTRICT,
    slot_start TIMESTAMPTZ NOT NULL,
    slot_end   TIMESTAMPTZ NOT NULL,
    mode VARCHAR(20) NOT NULL
        CHECK (mode IN ('in_person', 'online')),
    meeting_link TEXT,
    status VARCHAR(20) NOT NULL
        CHECK (status IN (
            'booked',
            'confirmed',
            'completed',
            'cancelled',
            'no_show'
        )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT appointment_slot_time_check
        CHECK (slot_end > slot_start),
    CONSTRAINT appointment_meeting_link_check
        CHECK (
            (mode = 'online' AND meeting_link IS NOT NULL)
            OR
            (mode = 'in_person' AND meeting_link IS NULL)
        )
);

CREATE TABLE consultation (
    consultation_id SERIAL PRIMARY KEY,
    appointment_id  INT NOT NULL UNIQUE
                    REFERENCES appointment(appointment_id) ON DELETE RESTRICT,
    chief_complaint TEXT NOT NULL,
    notes           TEXT,
    diagnosis       TEXT,
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ
);

CREATE TABLE drug (
    drug_id     SERIAL PRIMARY KEY,
    drug_name   VARCHAR(160) NOT NULL,
    generic_name VARCHAR(160) NOT NULL,
    drug_class  VARCHAR(120) NOT NULL,
    form        VARCHAR(60) NOT NULL,
    strength    VARCHAR(60) NOT NULL,
    unit_price  NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE prescription (
    prescription_id SERIAL PRIMARY KEY,
    consultation_id  INT NOT NULL
                     REFERENCES consultation(consultation_id) ON DELETE RESTRICT,
    issued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes            TEXT
);

CREATE TABLE prescription_item (
    item_id         SERIAL PRIMARY KEY,
    prescription_id INT NOT NULL
                    REFERENCES prescription(prescription_id) ON DELETE RESTRICT,
    drug_id         INT NOT NULL
                    REFERENCES drug(drug_id) ON DELETE RESTRICT,
    dose            VARCHAR(120) NOT NULL,
    frequency       VARCHAR(120) NOT NULL,
    duration_days   INT NOT NULL,
    quantity        INT NOT NULL CHECK (quantity > 0)
);

CREATE TABLE drug_interaction (
    drug_a_id        INT NOT NULL
                     REFERENCES drug(drug_id) ON DELETE RESTRICT,
    drug_b_id        INT NOT NULL
                     REFERENCES drug(drug_id) ON DELETE RESTRICT,
    severity         VARCHAR(20) NOT NULL,
    mechanism        TEXT NOT NULL,
    clinical_effect  TEXT NOT NULL,
    reference_source TEXT,
    PRIMARY KEY (drug_a_id, drug_b_id),
    CONSTRAINT drug_interaction_order_check
        CHECK (drug_a_id < drug_b_id)
);

CREATE TABLE interaction_alert (
    alert_id           SERIAL PRIMARY KEY,
    item_id            INT NOT NULL
                       REFERENCES prescription_item(item_id) ON DELETE RESTRICT,
    conflicting_item_id INT NOT NULL
                       REFERENCES prescription_item(item_id) ON DELETE RESTRICT,
    severity           VARCHAR(20) NOT NULL,
    message            TEXT NOT NULL,
    raised_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_by   INT
                       REFERENCES user_account(user_id) ON DELETE RESTRICT,
    acknowledged_at   TIMESTAMPTZ
);

CREATE TABLE ade_report (
    report_id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL
        REFERENCES patient(patient_id) ON DELETE RESTRICT,
    item_id INT
        REFERENCES prescription_item(item_id) ON DELETE RESTRICT,
    narrative TEXT NOT NULL
        CHECK (char_length(narrative) >= 20),
    narrative_tsv TSVECTOR GENERATED ALWAYS AS
        (to_tsvector('english', narrative)) STORED,
    narrative_vec VECTOR(384),
    onset_date DATE NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reported_by INT NOT NULL
        REFERENCES user_account(user_id) ON DELETE RESTRICT,
    severity_score NUMERIC(4, 2),
    status VARCHAR(20)
        CHECK (status IN ('new', 'under_review', 'confirmed', 'dismissed'))
);

CREATE TABLE invoice (
    invoice_id SERIAL PRIMARY KEY,
    consultation_id INT NOT NULL UNIQUE
        REFERENCES consultation(consultation_id) ON DELETE RESTRICT,
    issued_by INT NOT NULL
        REFERENCES user_account(user_id) ON DELETE RESTRICT,
    subtotal NUMERIC(10, 2),
    tax_amount NUMERIC(10, 2),
    total NUMERIC(10, 2),
    status VARCHAR(20),
    issued_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoice_line (
    line_id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL
        REFERENCES invoice(invoice_id) ON DELETE RESTRICT,
    line_type VARCHAR(30),
    description TEXT,
    quantity INT CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) CHECK (unit_price >= 0),
    line_total NUMERIC(10, 2)
);

CREATE TABLE reminder_queue (
    reminder_id SERIAL PRIMARY KEY,
    appointment_id INT NOT NULL
        REFERENCES appointment(appointment_id) ON DELETE RESTRICT,
    recipient_type VARCHAR(20),
    channel VARCHAR(20),
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    status VARCHAR(20),
    attempts INT
);

CREATE TABLE audit_log (
    log_id SERIAL PRIMARY KEY,
    actor_user_id INT
        REFERENCES user_account(user_id) ON DELETE RESTRICT,
    action VARCHAR(100),
    entity_type VARCHAR(100),
    entity_id INT,
    details JSONB,
    occurred_at TIMESTAMPTZ DEFAULT now()
);
