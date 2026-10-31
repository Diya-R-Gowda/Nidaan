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
