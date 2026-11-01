# Nidaan Entity–Relationship Diagram

This diagram follows the 16 tables and foreign keys in `db/01_schema.sql`.
The Mermaid relationship endpoints reflect the actual foreign-key optionality
and uniqueness constraints in that file.

```mermaid
erDiagram
    USER_ACCOUNT {
        int user_id PK
        varchar email UK
        varchar password_hash
        varchar full_name
        varchar role
        boolean is_active
        timestamptz created_at
    }
    DOCTOR {
        int doctor_id PK
        int user_id FK,UK
        varchar registration_no UK
        varchar specialisation
        numeric consultation_fee
    }
    PATIENT {
        int patient_id PK
        varchar full_name
        date date_of_birth
        varchar sex
        varchar phone
        varchar email
        varchar blood_group
        timestamptz registered_at
    }
    PATIENT_ALLERGY {
        int allergy_id PK
        int patient_id FK
        varchar substance
        varchar severity
        timestamptz noted_at
    }
    APPOINTMENT {
        int appointment_id PK
        int patient_id FK
        int doctor_id FK
        int created_by FK
        timestamptz slot_start
        timestamptz slot_end
        varchar mode
        text meeting_link
        varchar status
        timestamptz created_at
    }
    CONSULTATION {
        int consultation_id PK
        int appointment_id FK,UK
        text chief_complaint
        text notes
        text diagnosis
        timestamptz started_at
        timestamptz ended_at
    }
    DRUG {
        int drug_id PK
        varchar drug_name
        varchar generic_name
        varchar drug_class
        varchar form
        varchar strength
        numeric unit_price
        boolean is_active
    }
    PRESCRIPTION {
        int prescription_id PK
        int consultation_id FK
        timestamptz issued_at
        text notes
    }
    PRESCRIPTION_ITEM {
        int item_id PK
        int prescription_id FK
        int drug_id FK
        varchar dose
        varchar frequency
        int duration_days
        int quantity
    }
    DRUG_INTERACTION {
        int drug_a_id PK,FK
        int drug_b_id PK,FK
        varchar severity
        text mechanism
        text clinical_effect
        text reference_source
    }
    INTERACTION_ALERT {
        int alert_id PK
        int item_id FK
        int conflicting_item_id FK
        varchar severity
        text message
        timestamptz raised_at
        int acknowledged_by FK
        timestamptz acknowledged_at
    }
    ADE_REPORT {
        int report_id PK
        int patient_id FK
        int item_id FK
        text narrative
        tsvector narrative_tsv "generated stored"
        vector narrative_vec "384 dimensions"
        date onset_date
        timestamptz reported_at
        int reported_by FK
        numeric severity_score
        varchar status
    }
    INVOICE {
        int invoice_id PK
        int consultation_id FK,UK
        int issued_by FK
        numeric subtotal
        numeric tax_amount
        numeric total
        varchar status
        timestamptz issued_at
    }
    INVOICE_LINE {
        int line_id PK
        int invoice_id FK
        varchar line_type
        text description
        int quantity
        numeric unit_price
        numeric line_total
    }
    REMINDER_QUEUE {
        int reminder_id PK
        int appointment_id FK
        varchar recipient_type
        varchar channel
        timestamptz scheduled_for
        timestamptz sent_at
        varchar status
        int attempts
    }
    AUDIT_LOG {
        int log_id PK
        int actor_user_id FK
        varchar action
        varchar entity_type
        int entity_id
        jsonb details
        timestamptz occurred_at
    }

    USER_ACCOUNT ||--o| DOCTOR : has_profile
    PATIENT ||--o{ PATIENT_ALLERGY : has
    PATIENT ||--o{ APPOINTMENT : books
    DOCTOR ||--o{ APPOINTMENT : attends
    USER_ACCOUNT ||--o{ APPOINTMENT : creates
    APPOINTMENT ||--o| CONSULTATION : results_in
    CONSULTATION ||--o{ PRESCRIPTION : produces
    PRESCRIPTION ||--o{ PRESCRIPTION_ITEM : contains
    DRUG ||--o{ PRESCRIPTION_ITEM : prescribed_as
    DRUG ||--o{ DRUG_INTERACTION : drug_a
    DRUG ||--o{ DRUG_INTERACTION : drug_b
    PRESCRIPTION_ITEM ||--o{ INTERACTION_ALERT : flagged_item
    PRESCRIPTION_ITEM ||--o{ INTERACTION_ALERT : conflicting_item
    USER_ACCOUNT o|--o{ INTERACTION_ALERT : acknowledges
    PATIENT ||--o{ ADE_REPORT : has_reports
    PRESCRIPTION_ITEM o|--o{ ADE_REPORT : suspected_item
    USER_ACCOUNT ||--o{ ADE_REPORT : reports
    CONSULTATION ||--o| INVOICE : billed_by
    USER_ACCOUNT ||--o{ INVOICE : issues
    INVOICE ||--o{ INVOICE_LINE : itemised_as
    APPOINTMENT ||--o{ REMINDER_QUEUE : queues
    USER_ACCOUNT o|--o{ AUDIT_LOG : acts
```
