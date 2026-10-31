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
