# Nidaan Presentation Guide

## 1. One-minute introduction

> Nidaan is a clinic consultation management and adverse drug event detection
> platform. It connects the complete clinical workflow: appointment booking,
> consultation, prescription, adverse-event reporting, and billing.
>
> The project uses PostgreSQL for structured clinical and billing data and
> pgvector for semantic search over free-text adverse-event narratives. The
> main idea is that a clinic should not only store a patient's report; it
> should also detect whether another patient has described a similar reaction.
>
> The system has four roles: receptionist, prescriber, pharmacovigilance
> officer, and administrator. Each role has a separate dashboard and
> server-side authorization.

## 2. Problem statement

Small clinics face three related problems:

1. **Adverse-event reports are unstructured.** Patients describe the same
   reaction using different words.
2. **There is no exposure denominator.** A report count alone is not enough.
   The system must compare adverse events with the number of patients exposed
   to a drug.
3. **Drug interactions are easy to miss.** A doctor may not remember every
   dangerous pair while prescribing.

Nidaan addresses these problems with:

- relational tables and foreign keys for the clinic workflow;
- a database trigger for drug-interaction alerts;
- a reminder trigger when appointments are confirmed;
- vector embeddings and cosine similarity for narrative matching;
- aggregate SQL queries for drug-safety rates;
- role-based authentication and authorization.

## 3. Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js App Router and React | Pages and role-specific dashboards |
| API | Next.js route handlers | Server-side POST, GET, PATCH and DELETE operations |
| Language | TypeScript | Type-safe application code |
| Relational database | PostgreSQL | Clinical, appointment, prescription and billing data |
| Vector extension | pgvector | Stores and searches 384-dimensional embeddings |
| Database driver | node-postgres (`pg`) | Connection pool and parameterized queries |
| Authentication | bcrypt and signed cookies | Password verification and staff sessions |
| Embedding model | `Xenova/all-MiniLM-L6-v2` | Converts narratives into vectors |
| Tools | Git, GitHub, PowerShell, psql | Development, version control and database testing |

### Why PostgreSQL?

The clinical data is highly connected and correctness-critical. Patients,
appointments, consultations, prescriptions and invoices need foreign keys,
constraints and transactions. PostgreSQL provides all of these.

pgvector keeps the narrative embedding in the same database as the report.
Therefore, the narrative and its vector can be inserted in one transaction,
and similarity search can be combined with normal SQL joins and filters.

## 4. Explain the repository

```text
nidaan/
├── app/
│   ├── (auth)/login/             Login page
│   ├── reception/                Receptionist pages
│   ├── doctor/                   Doctor pages
│   ├── pharmacovigilance/       Safety and similarity pages
│   ├── admin/                    User, drug, interaction and audit pages
│   └── api/                      Server-side route handlers
├── db/
│   ├── 01_schema.sql             Tables, constraints and indexes
│   ├── 02_triggers.sql           Trigger functions and triggers
│   ├── 03_procedures.sql         Stored functions
│   ├── 04_views.sql              Views and materialized view
│   └── 05_seed.sql               Demo drugs, patients and reports
├── lib/
│   ├── db.ts                     PostgreSQL connection pool
│   ├── auth.ts                   bcrypt, sessions and role guards
│   └── embeddings.ts             Text-to-vector helper
├── scripts/
│   ├── seed-users.ts             Creates demo staff accounts
│   └── embed-seed.ts             Embeds reports with missing vectors
├── docs/                         Diagrams, screenshots and test results
├── package.json                  Scripts and dependencies
└── README.md                     Requirements and technical documentation
```

### How to explain the `app` folder

The `app` folder uses the Next.js App Router:

- `page.tsx` files are pages.
- Folders group pages by role or feature.
- `route.ts` files are API endpoints.
- A page can load protected server-side data using the session and database
  pool.
- Client components handle forms and interactive controls.

For example:

- `app/reception/book/page.tsx` is the appointment-booking screen.
- `app/doctor/prescriptions/page.tsx` loads the doctor's consultations and
  active drugs.
- `app/api/prescriptions/route.ts` validates and saves prescriptions.
- `app/pharmacovigilance/reports/[id]/page.tsx` displays a report and similar
  reports.

## 5. ER diagram explanation

Start with the central workflow:

```text
Patient ──< Appointment >── Doctor
              │
              └── Consultation ──< Prescription ──< PrescriptionItem >── Drug
                                                        │
                                                        ├── InteractionAlert
                                                        └── ADEReport
```

Then explain the remaining entities:

- `user_account` stores staff login accounts and roles.
- `doctor` extends a staff account with registration number, specialisation
  and consultation fee.
- `patient` stores clinical identity information. Patients do not log in.
- `patient_allergy` stores a patient's allergies.
- `appointment` connects a patient, doctor and receptionist who created it.
- `consultation` stores complaint, notes and diagnosis for an appointment.
- `prescription` belongs to a consultation.
- `prescription_item` represents one drug inside a prescription.
- `drug_interaction` is a recursive many-to-many relationship from `drug` to
  `drug`.
- `interaction_alert` records a detected interaction between prescription
  items.
- `ade_report` stores an adverse-event narrative and optional suspected
  prescription item.
- `invoice` is the billing header and `invoice_line` stores its itemised
  charges.
- `reminder_queue` stores patient and doctor reminders.
- `audit_log` records clinical and catalogue changes.

### Important cardinalities

| Relationship | Cardinality | Meaning |
|---|---:|---|
| Patient to appointment | 1:N | A patient can have many appointments |
| Doctor to appointment | 1:N | A doctor can attend many appointments |
| Appointment to consultation | 1:1 | One appointment has at most one consultation |
| Consultation to prescription | 1:N | A consultation can produce prescriptions |
| Prescription to prescription item | 1:N | One prescription can contain many drugs |
| Drug to prescription item | 1:N | A drug can appear in many prescriptions |
| Drug to drug interaction | M:N | A drug can interact with many other drugs |
| Consultation to invoice | 1:1 | A consultation is billed once |
| Invoice to invoice line | 1:N | One invoice has multiple charges |

### Design decisions to mention

1. **Patients are not users.** Patients are clinical records; only staff
   roles need login accounts.
2. **Prescription and prescription item are separate.** This supports
   multiple drugs per prescription without repeating groups.
3. **Consultation has a unique appointment foreign key.** This enforces the
   one-to-one relationship in the database.
4. **Drug interactions use a composite primary key.** The pair is stored once.
5. **`drug_a_id < drug_b_id` canonicalizes the pair.** It prevents storing
   both `(Warfarin, Aspirin)` and `(Aspirin, Warfarin)`.
6. **Clinical foreign keys use `ON DELETE RESTRICT`.** Historical clinical
   data cannot be silently deleted.

## 6. Relational schema explanation

The relational schema is the ER design converted into tables.

### Core identity tables

```text
user_account(user_id PK, email UNIQUE, password_hash, role, is_active)
doctor(doctor_id PK, user_id FK UNIQUE, registration_no UNIQUE, ...)
patient(patient_id PK, full_name, date_of_birth, ...)
patient_allergy(allergy_id PK, patient_id FK, substance, ...)
```

`doctor.user_id` is unique, so one user account can represent at most one
doctor profile.

### Appointment and clinical tables

```text
appointment(appointment_id PK, patient_id FK, doctor_id FK,
            created_by FK, slot_start, slot_end, mode, status)
consultation(consultation_id PK, appointment_id FK UNIQUE,
             chief_complaint, notes, diagnosis)
prescription(prescription_id PK, consultation_id FK, notes)
prescription_item(item_id PK, prescription_id FK, drug_id FK,
                  dose, frequency, duration_days, quantity)
```

The foreign keys preserve the clinical chain:

```text
patient → appointment → consultation → prescription → prescription_item
```

### Safety and billing tables

```text
drug(drug_id PK, drug_name, generic_name, unit_price, is_active)
drug_interaction(drug_a_id PK/FK, drug_b_id PK/FK, severity, ...)
interaction_alert(alert_id PK, item_id FK, conflicting_item_id FK, ...)
ade_report(report_id PK, patient_id FK, item_id FK, narrative, ...)
invoice(invoice_id PK, consultation_id FK UNIQUE, ...)
invoice_line(line_id PK, invoice_id FK, ...)
reminder_queue(reminder_id PK, appointment_id FK, ...)
audit_log(log_id PK, actor_user_id FK, ...)
```

### Constraints worth demonstrating

- Role must be one of the four allowed roles.
- Appointment mode must be `in_person` or `online`.
- Online appointments require a meeting link.
- In-person appointments must not have a meeting link.
- Appointment end must be after appointment start.
- Prescription quantity must be positive.
- Drug price must not be negative.
- ADE narrative must contain at least 20 characters.
- Interaction drug IDs must be ordered.
- Foreign keys prevent orphan records.

### Normalisation answer

The schema is in third normal form:

- **1NF:** repeating groups are removed. A prescription's drugs are rows in
  `prescription_item`.
- **2NF:** non-key columns depend on the complete key. Interaction details
  depend on the complete pair of drug IDs.
- **3NF:** attributes are stored with the entity they describe. For example,
  the drug price belongs to `drug`, not to `patient`.

Invoice line prices are intentionally stored as a historical financial
snapshot. If the catalogue price changes later, an old invoice must remain
unchanged.

## 7. End-to-end system workflow

### Step 1: Login

1. The user submits email and password on the login page.
2. The login route queries `user_account` using a parameterized query.
3. bcrypt compares the submitted password with `password_hash`.
4. Inactive users are rejected.
5. A signed, httpOnly, secure, same-site session cookie is created.
6. The role determines the dashboard:
   - receptionist → `/reception`
   - prescriber → `/doctor`
   - pharmacovigilance → `/pharmacovigilance`
   - admin → `/admin`

### Step 2: Receptionist books an appointment

The receptionist selects a patient, doctor, time and mode.

The API uses a transaction and checks:

- the doctor exists and is active;
- the patient exists;
- the requested slot does not overlap another active slot.

The appointment is then inserted. A transaction prevents two simultaneous
requests from successfully taking the same slot.

### Step 3: Doctor records a consultation

The doctor opens an appointment belonging to that doctor and submits:

- chief complaint;
- clinical notes;
- diagnosis.

The API checks the prescriber role and doctor ownership. It inserts the
consultation and marks the appointment as completed in the same transaction.

### Step 4: Doctor creates a prescription

The doctor selects a consultation and adds one or more drug items.

The API:

1. checks the prescriber role;
2. verifies that the consultation belongs to that doctor;
3. validates each drug and dosage field;
4. inserts the prescription and its items transactionally;
5. returns interaction alerts for review;
6. requires the interaction review before final save.

The database trigger checks newly inserted prescription items against active
interacting medicines and writes `interaction_alert` rows.

### Step 5: Appointment confirmation and reminders

When an appointment changes to `confirmed`, the reminder trigger creates two
pending in-app reminders:

- one for the patient;
- one for the doctor.

The database queues the reminders. The application is responsible for
dispatching or marking them as sent.

### Step 6: Invoice generation

The receptionist requests an invoice for a consultation.

The API calls `fn_compute_invoice(consultation_id)`. The stored function:

1. retrieves the doctor's consultation fee;
2. calculates the prescription drug subtotal;
3. adds the consultation fee;
4. calculates 18% tax;
5. inserts the invoice header;
6. inserts the consultation and drug invoice lines;
7. returns the invoice ID.

The API then returns the invoice and its line rows.

### Step 7: Adverse-event reporting

A prescriber submits a narrative such as:

```text
The patient reports bleeding gums and purple patches on both arms.
```

The API:

1. checks the prescriber role and patient/doctor relationship;
2. calls `embed(narrative)`;
3. produces a normalized 384-dimensional vector;
4. inserts the narrative and vector in one transaction.

### Step 8: Pharmacovigilance analysis

The pharmacovigilance dashboard combines:

- report inbox;
- drug signal rates;
- severity scores;
- full-text comparison;
- vector similarity search.

For example, the system can compare:

- “bleeding gums and purple patches on arms”
- “blood while brushing teeth, unusual bruising”

Full-text search depends mainly on shared tokens. Vector similarity compares
semantic meaning, so it can retrieve the differently worded report.

## 8. Database features to explain

### Constraints

Constraints protect data even if someone bypasses the website. Frontend
validation is convenient, but the database is the final authority.

### Triggers

- `trg_check_interaction` creates alerts after prescription items are added.
- `trg_queue_reminders` creates reminders when an appointment is confirmed.
- audit triggers create `audit_log` records for important changes.

### Stored procedures/functions

- `fn_compute_invoice` computes invoice totals and lines.
- `fn_signal_rate` computes adverse-event rate for a drug and date range.
- `fn_severity_score` produces a simple severity score from report context.

### Views

- `vw_doctor_schedule` presents upcoming doctor appointments with
  consultation information.
- `vw_pending_reminders` exposes reminders that are pending and due soon.
- `vw_drug_signal_rates` is a materialized view of drug exposure and event
  rates.

### Indexes

- HNSW index on the vector column for nearest-neighbour search.
- GIN index on `narrative_tsv` for full-text search.
- B-tree index on doctor and slot for booking checks.
- B-tree index on prescription-item drug IDs for exposure queries.
- partial appointment-status index for active appointments.

## 9. Frontend explanation

The frontend is role-based:

### Receptionist dashboard

- books appointments;
- registers or selects patients;
- confirms appointments;
- views pending reminders;
- generates invoices.

### Doctor dashboard

- shows today's booked and confirmed appointments;
- opens the consultation form;
- records clinical notes and diagnosis;
- builds prescriptions;
- displays drug-interaction warnings;
- submits adverse-event reports.

### Pharmacovigilance dashboard

- shows signal rates;
- lists reports;
- shows similar narratives;
- compares full-text and vector results;
- supports report review.

### Admin dashboard

- shows counts of users, drugs and audit rows;
- manages users;
- manages the drug catalogue;
- manages drug interactions;
- views audit logs.

The frontend does not provide the real security boundary. A user could call
an API manually, so every protected route repeats the role check on the
server using `requireRole`.

## 10. A smooth live demonstration

Use this order during the presentation:

1. Open the login page and explain the four roles.
2. Log in as receptionist.
3. Book an appointment for the prescriber.
4. Log in as prescriber in a separate private window.
5. Open the appointment and record a consultation.
6. Open the prescription builder.
7. Add two interacting drugs and show the warning.
8. Confirm an appointment and show the reminder rows if database access is
   available.
9. Log in as receptionist and show invoice generation.
10. Log in as pharmacovigilance officer and show the report dashboard.
11. Show the two differently worded bleeding narratives and their similarity.
12. Log in as admin and show users, drugs, interactions and audit logs.
13. Demonstrate one authorization failure, such as a doctor calling the
   receptionist-only invoice endpoint and receiving HTTP 403.

### What to prepare before presenting

- Start PostgreSQL.
- Confirm `.env.local` exists, but do not show it on screen.
- Confirm the schema, triggers, procedures, views and seed data are loaded.
- Run the user seed script if demo users are missing.
- Run `npm run embed:seed` if vectors are missing.
- Start the app with `npm run dev`.
- Keep a second terminal ready with `psql`.
- Use private browser windows for different roles.
- Prepare screenshots or backup output in case a live database action fails.

Do not show passwords, `DATABASE_URL`, `SESSION_SECRET`, or the contents of
`.env.local` in the presentation.

## 11. Short answers to likely questions

### Why not use only a normal relational text search?

Relational full-text search works with tokens and stemming. It may miss
reports that use different vocabulary. Embeddings represent semantic meaning,
so paraphrases can be ranked as similar.

### Why store both `narrative_tsv` and `narrative_vec`?

They serve different purposes. The GIN-backed tsvector provides a fast
keyword baseline, while the vector supports semantic similarity. Keeping
both allows the project to compare the two approaches.

### Why is the interaction table self-referencing?

A drug interacts with another drug, so both foreign keys point to `drug`.
This is a recursive many-to-many relationship resolved by
`drug_interaction`.

### Why use a trigger instead of application code for interactions?

The rule belongs to the data operation. A trigger ensures an alert is created
even if prescription data is inserted through another client, not only
through this frontend.

### Why use a transaction for booking?

The doctor-slot check and appointment insert must be treated as one atomic
operation. Transactions and row locking prevent two concurrent bookings from
both claiming the same slot.

### Why are invoice lines stored?

They provide an itemised historical bill. Storing the price at invoice time
prevents future catalogue-price changes from changing old bills.

### How is SQL injection prevented?

Application queries use node-postgres parameter placeholders such as `$1`,
`$2`, and pass values separately. User input is never concatenated into SQL.

### How are passwords protected?

Passwords are hashed with bcrypt. Only the hash is stored; the plain password
is never returned by the login API. The session is a signed httpOnly cookie.

### Why are patients not given accounts?

This project models clinic staff as authenticated users. Patients are
clinical records managed by staff. Patient self-service login is outside the
current scope.

### What happens if a doctor tries to access receptionist functionality?

The server calls `requireRole`. The request is rejected with HTTP 403 even if
the doctor manually calls the API.

## 12. Closing statement

> Nidaan is more than a CRUD application because important behaviour is
> derived by the database. Triggers detect interactions and queue reminders,
> transactions protect concurrent booking and billing, stored functions
> compute invoices and safety scores, and pgvector retrieves semantically
> similar adverse-event narratives. The relational model preserves the
> complete clinical chain, while the vector component helps discover patterns
> that keyword matching would miss.

## 13. Personal presentation checklist

- [ ] I can explain the problem in three sentences.
- [ ] I can identify every major ER entity.
- [ ] I can explain the appointment-to-prescription chain.
- [ ] I can explain why `prescription_item` is separate.
- [ ] I can explain the recursive `drug_interaction` table.
- [ ] I can explain one trigger and one stored function.
- [ ] I can explain HNSW and cosine similarity at a high level.
- [ ] I can explain why API authorization is server-side.
- [ ] I can demonstrate one complete role workflow.
- [ ] I can show a 403 authorization result.
- [ ] I will not expose `.env.local` or passwords.
