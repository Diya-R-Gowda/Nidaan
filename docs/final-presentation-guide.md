# Nidaan — Final Project Presentation Guide

This guide is written as a speaking script for the final DBMS presentation.
It explains **what Nidaan is, why it was built, where each feature is
implemented, and how the complete workflow operates**.

Use the headings as presentation topics. Do not read every sentence exactly;
use the short explanations as prompts while demonstrating the application.

---

## 1. Opening introduction

> Nidaan is a clinic consultation management and adverse drug event detection
> platform. It connects appointment booking, consultation, prescriptions,
> adverse-event reporting, pharmacovigilance analysis, billing and audit
> logging in one system.
>
> The project uses PostgreSQL for structured clinical data and pgvector for
> semantic search over free-text adverse-event narratives. The important
> database idea is that the system does more than store records: it detects
> drug interactions, prevents double booking, queues reminders, computes
> invoices, calculates safety signals and finds similarly worded adverse
> events.

The four application roles are:

1. **Receptionist** — registers patients, manages appointments and generates
   invoices.
2. **Prescriber** — conducts consultations, creates prescriptions and reports
   adverse drug events.
3. **Pharmacovigilance officer** — reviews ADE reports, searches similar
   reports and reviews drug signals.
4. **Administrator** — manages users, drugs, interactions and audit logs.

---

## 2. Problem statement

Small clinics face three connected problems:

### Problem 1: Adverse-event narratives use different words

Two patients may describe the same reaction differently:

- “Bleeding gums and purple patches on the arms”
- “Blood while brushing teeth and unusual bruising”

A normal keyword search may fail to connect these reports.

### Problem 2: A report count alone is not enough

Nine reports about a drug may be serious if only twenty patients were exposed,
but less significant if four hundred patients received it. A useful safety
signal needs both:

- the number of adverse-event reports; and
- the number of exposed patients.

### Problem 3: Drug interactions can be missed during prescribing

A dangerous drug pair should be detected automatically rather than relying
only on the prescriber’s memory.

### Nidaan’s solution

- PostgreSQL tables and constraints preserve clinical relationships.
- A database trigger detects known drug interactions.
- A transaction prevents two users from booking the same slot.
- pgvector stores 384-dimensional narrative embeddings.
- Cosine similarity retrieves semantically related reports.
- Aggregate SQL calculates drug signal rates.
- Role guards prevent unauthorized operations.

---

## 3. Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js App Router, React, TypeScript | Role-specific pages and forms |
| Backend | Next.js route handlers | Protected server-side API operations |
| Database | PostgreSQL | Clinical, appointment, prescription and billing data |
| Vector feature | pgvector | 384-dimensional embeddings and cosine search |
| Database driver | `pg` | Connection pooling and parameterized SQL |
| Authentication | `bcrypt` and signed httpOnly cookies | Password verification and sessions |
| Embedding model | `Xenova/all-MiniLM-L6-v2` | Converts ADE narratives into vectors |
| Development tools | Git, GitHub, PowerShell and `psql` | Development, version control and verification |

### Why PostgreSQL?

The data is highly connected and correctness is important. A patient,
appointment, consultation, prescription and invoice must remain linked.
PostgreSQL provides:

- primary keys and foreign keys;
- unique and check constraints;
- transactions;
- row locking;
- triggers;
- stored functions;
- views and indexes;
- JSONB and pgvector support.

### Why pgvector?

An ADE narrative is unstructured text. The application converts it into a
384-dimensional vector. Similar narratives are found using cosine distance,
even when the exact words differ.

---

## 4. System architecture

Explain the request flow like this:

```text
Browser
  ↓
Next.js page or client component
  ↓
Next.js route handler under app/api
  ↓
Authentication and role authorization
  ↓
Parameterized SQL through node-postgres pool
  ↓
PostgreSQL tables, triggers, functions, views and pgvector
```

### What happens during a request?

1. The user opens a role-specific page.
2. The server reads the signed session cookie.
3. The server verifies that the account is active and has the required role.
4. The route validates the request body and IDs.
5. SQL runs through the pooled PostgreSQL connection.
6. Constraints, triggers or stored functions enforce database behavior.
7. The route returns a controlled success or error response.
8. The frontend displays the result.

The browser is not trusted to enforce authorization. The API checks
authorization again on the server.

---

## 5. Repository walkthrough

```text
nidaan/
├── app/
│   ├── (auth)/login/                 Login page
│   ├── reception/                    Receptionist pages
│   ├── doctor/                       Prescriber pages
│   ├── pharmacovigilance/            Safety officer pages
│   ├── admin/                        Administrator pages
│   └── api/                          Protected route handlers
├── db/
│   ├── 01_schema.sql                 Tables, constraints and indexes
│   ├── 02_triggers.sql               Trigger functions and triggers
│   ├── 03_procedures.sql             Stored database functions
│   ├── 04_views.sql                  Views and signal-rate view
│   ├── 05_seed.sql                   Demo drugs, patients and reports
│   └── migrations/                   Later database migrations
├── lib/
│   ├── db.ts                         PostgreSQL connection pool
│   ├── auth.ts                       Sessions and role guards
│   └── embeddings.ts                 Text-to-vector helper
├── scripts/
│   ├── seed-users.ts                 Demo staff accounts
│   ├── embed-seed.ts                 Populate missing ADE vectors
│   ├── migrate-signal-rates.ts      Signal-rate migration
│   └── refresh-signal-rates.ts       Refresh signal view
├── tests/                            Integration tests
├── docs/                             Report, diagrams and evidence
├── package.json                      Commands and dependencies
└── README.md                         Project requirements and documentation
```

### Files to show during the presentation

- [db/01_schema.sql](../db/01_schema.sql) — relational schema and indexes
- [db/02_triggers.sql](../db/02_triggers.sql) — automatic database behavior
- [db/03_procedures.sql](../db/03_procedures.sql) — invoice, severity and signal functions
- [db/04_views.sql](../db/04_views.sql) — reporting views
- [lib/auth.ts](../lib/auth.ts) — authentication and role authorization
- [lib/db.ts](../lib/db.ts) — pooled PostgreSQL connection
- [lib/embeddings.ts](../lib/embeddings.ts) — embedding generation
- [docs/relational-schema.dbml](../docs/relational-schema.dbml) — relational schema diagram source
- [docs/er-diagram.png](../docs/er-diagram.png) — ER diagram

---

## 6. ER diagram explanation

Begin with the central clinical chain:

```text
Patient ──< Appointment >── Doctor
              │
              └── Consultation ──< Prescription ──< PrescriptionItem >── Drug
                                                        │
                                                        ├── InteractionAlert
                                                        └── ADEReport
```

### Main entities

| Entity | Explanation |
|---|---|
| `user_account` | Staff login account and role |
| `doctor` | Prescriber profile linked to a staff account |
| `patient` | Clinical identity record; patients do not log in |
| `patient_allergy` | Allergies associated with a patient |
| `appointment` | Patient, doctor, creator, time, mode and status |
| `consultation` | Complaint, notes and diagnosis for an appointment |
| `drug` | Drug catalogue and price information |
| `prescription` | Prescription header linked to a consultation |
| `prescription_item` | One drug, dose, frequency, duration and quantity |
| `drug_interaction` | Canonical pair of interacting drugs |
| `interaction_alert` | Warning generated for prescription items |
| `ade_report` | Narrative, severity, status, vector and optional drug item |
| `invoice` | Billing header for a consultation |
| `invoice_line` | Individual invoice charges |
| `reminder_queue` | Patient and doctor reminder records |
| `audit_log` | History of clinical and catalogue changes |

### Important cardinalities

- One patient can have many appointments.
- One doctor can have many appointments.
- One appointment has at most one consultation.
- One consultation can have prescriptions.
- One prescription has many prescription items.
- One drug can appear in many prescription items.
- Drugs have a many-to-many interaction relationship represented by
  `drug_interaction`.
- One consultation has at most one invoice.
- One invoice has many invoice lines.

### Design decisions to explain

1. Patients are separate from users because patients do not authenticate.
2. Prescription headers and items are separate to support multiple drugs.
3. A unique appointment foreign key in `consultation` enforces the one-to-one
   consultation relationship.
4. The interaction table uses a composite primary key.
5. `drug_a_id < drug_b_id` prevents reverse duplicate pairs.
6. `ON DELETE RESTRICT` protects historical clinical data.

---

## 7. Relational schema and SQL features

### Tables and integrity

The schema begins by enabling pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The schema then creates the user, doctor, patient, appointment, consultation,
drug, prescription, ADE, invoice, reminder and audit tables.

Integrity is enforced with:

- primary keys;
- foreign keys;
- unique constraints;
- role and status checks;
- positive quantity checks;
- appointment time checks;
- online/in-person meeting-link checks;
- canonical interaction ordering;
- restricted deletion of historical records.

### Triggers

The project uses triggers for behavior that should happen automatically:

1. **Interaction trigger**  
   When a prescription item is inserted, it checks active medicines for the
   patient and inserts an `interaction_alert` if a known pair is found.

2. **Reminder trigger**  
   When an appointment becomes confirmed, it creates pending reminders for the
   patient and doctor.

3. **Audit triggers**  
   Inserts and updates to appointments, consultations, prescriptions, ADE
   reports and drugs create rows in `audit_log`.

### Stored functions

- `fn_compute_invoice` calculates subtotal, tax, total and invoice lines.
- `fn_signal_rate` calculates report rates against exposed patients.
- `fn_severity_score` derives a severity score from report information.

### Views and indexes

- `vw_doctor_schedule` presents doctor schedule data.
- `vw_pending_reminders` presents pending reminders.
- `vw_drug_signal_rates` presents materialized drug safety rates.
- GIN indexing supports full-text narrative search.
- HNSW indexing supports vector similarity search.
- Appointment and drug indexes support common workflow queries.

---

## 8. Complete application demonstration

Use synthetic records during the live demonstration.

### 8.1 Login

Open:

```text
http://localhost:3000/login
```

Explain:

1. The user enters an email and password.
2. The login route verifies the password with bcrypt.
3. A signed httpOnly session cookie is created.
4. The user is redirected according to role.

Never display `.env.local`, passwords, `DATABASE_URL` or `SESSION_SECRET`.

### 8.2 Receptionist workflow

Sign in as the receptionist and demonstrate:

1. Open the receptionist dashboard.
2. Register a synthetic patient.
3. Open appointment booking.
4. Select the patient and prescriber.
5. Select an available date and time.
6. Choose in-person or online mode.
7. For an online appointment, provide a meeting link.
8. Book the appointment.
9. Open the calendar and verify the booking.
10. Optionally confirm, reschedule or cancel the appointment.

Explain that booking is protected against conflicts. Concurrent requests use
the database locking path so only one conflicting booking succeeds.

Relevant files:

- [app/reception/patients/new/page.tsx](../app/reception/patients/new/page.tsx)
- [app/reception/book/page.tsx](../app/reception/book/page.tsx)
- [app/reception/calendar/page.tsx](../app/reception/calendar/page.tsx)
- [app/api/appointments/route.ts](../app/api/appointments/route.ts)
- [app/api/patients/route.ts](../app/api/patients/route.ts)

### 8.3 Prescriber consultation workflow

Sign out and sign in as the prescriber:

1. Open the doctor dashboard.
2. Open the synthetic appointment.
3. Enter chief complaint.
4. Enter clinical notes.
5. Enter diagnosis.
6. Save the consultation.
7. Confirm that the appointment moves to the appropriate completed state.

Relevant files:

- [app/doctor/page.tsx](../app/doctor/page.tsx)
- [app/doctor/consult/[appointmentId]/page.tsx](../app/doctor/consult/[appointmentId]/page.tsx)
- [app/api/consultations/route.ts](../app/api/consultations/route.ts)

### 8.4 Prescription workflow and interaction alert

1. Open the Prescription Builder.
2. Select the saved consultation.
3. Select an active drug.
4. Enter dose, frequency, duration and quantity.
5. Add a second drug with a seeded interaction.
6. Select **Check interactions**.
7. Show the warning before confirming.
8. Explain that the database trigger creates the alert.
9. Confirm and save only after reviewing the warning.

Relevant files:

- [app/doctor/prescriptions/page.tsx](../app/doctor/prescriptions/page.tsx)
- [app/doctor/prescriptions/PrescriptionBuilder.tsx](../app/doctor/prescriptions/PrescriptionBuilder.tsx)
- [app/api/prescriptions/route.ts](../app/api/prescriptions/route.ts)
- [db/02_triggers.sql](../db/02_triggers.sql)

### 8.5 ADE report workflow

1. Open `/doctor/ade-report`.
2. Select the synthetic patient.
3. Select the suspected prescription item if available.
4. Enter a narrative of at least 20 characters.
5. Select the severity or provide the available clinical details.
6. Submit the report.
7. Explain that the server validates ownership.
8. Explain that the narrative is converted to a 384-dimensional vector.
9. Explain that the report is now available to Pharmacovigilance.

Example synthetic narrative:

> Synthetic test patient reported mild dizziness after taking the prescribed
> medication. Symptoms improved after rest. No hospitalization was required.

Relevant files:

- [app/doctor/ade-report/page.tsx](../app/doctor/ade-report/page.tsx)
- [app/doctor/ade-report/AdeReportForm.tsx](../app/doctor/ade-report/AdeReportForm.tsx)
- [app/api/ade-reports/route.ts](../app/api/ade-reports/route.ts)
- [lib/embeddings.ts](../lib/embeddings.ts)

### 8.6 Pharmacovigilance review and similarity

Sign in as the Pharmacovigilance officer:

1. Open the ADE report inbox.
2. Open the submitted report.
3. Review its narrative, status, severity and suspected item.
4. Open **Vector similarity**.
5. Show related reports and cosine scores.
6. Switch to **Full-text comparison**.
7. Explain why the two rankings can differ.
8. Confirm or dismiss the report.
9. Open the signal dashboard.
10. Explain that signal rates use report count divided by exposed-patient
    count and apply the minimum exposure threshold.

Relevant files:

- [app/pharmacovigilance/reports/page.tsx](../app/pharmacovigilance/reports/page.tsx)
- [app/pharmacovigilance/reports/[id]/page.tsx](../app/pharmacovigilance/reports/[id]/page.tsx)
- [app/pharmacovigilance/reports/[id]/SimilarReports.tsx](../app/pharmacovigilance/reports/[id]/SimilarReports.tsx)
- [app/pharmacovigilance/page.tsx](../app/pharmacovigilance/page.tsx)
- [app/api/ade-reports/[id]/similar/route.ts](../app/api/ade-reports/[id]/similar/route.ts)

### 8.7 Invoice workflow

Return to the receptionist role:

1. Open billing.
2. Select the completed consultation.
3. Generate the invoice.
4. Show the consultation fee and prescription items.
5. Show subtotal, tax and total.
6. Explain that the total is calculated by the database function rather than
   trusted from a browser-provided total.

Relevant files:

- [app/reception/billing/page.tsx](../app/reception/billing/page.tsx)
- [app/reception/billing/[id]/page.tsx](../app/reception/billing/[id]/page.tsx)
- [app/api/invoices/route.ts](../app/api/invoices/route.ts)
- [db/03_procedures.sql](../db/03_procedures.sql)

### 8.8 Administrator workflow

Sign in as the administrator and demonstrate:

1. Dashboard counts.
2. User management.
3. Drug catalogue.
4. Interaction management.
5. Audit-log viewer.

Explain that administrator pages are protected separately from clinical
workflow pages.

Relevant files:

- [app/admin/page.tsx](../app/admin/page.tsx)
- [app/admin/users/page.tsx](../app/admin/users/page.tsx)
- [app/admin/drugs/page.tsx](../app/admin/drugs/page.tsx)
- [app/admin/interactions/page.tsx](../app/admin/interactions/page.tsx)
- [app/admin/audit-logs/page.tsx](../app/admin/audit-logs/page.tsx)

---

## 9. Vector search explanation

Explain the vector feature in four steps:

1. The ADE narrative is plain text.
2. `Xenova/all-MiniLM-L6-v2` converts it into a normalized vector.
3. The vector is stored in `ade_report.narrative_vec` with dimension 384.
4. pgvector compares vectors using cosine distance.

The similarity expression is:

```sql
1 - (target.narrative_vec <=> source.narrative_vec)
```

Higher values mean more similar narratives.

The project also stores a generated `narrative_tsv` column and a GIN index
for full-text search. This allows a direct comparison:

- **Full-text search** matches words and linguistic terms.
- **Vector search** matches semantic meaning.

The collected terminal evidence is in
[docs/screenshots/](../docs/screenshots/), including:

- `sql-embedding-dimensions.png`
- `sql-embedding-counts.png`
- `sql-fulltext-result.png`
- `sql-vector-similarity-results.png`

---

## 10. Security explanation

The project implements security at the server boundary:

- passwords are verified with bcrypt;
- sessions use signed httpOnly cookies;
- inactive accounts are rejected;
- role checks run in pages and API routes;
- SQL queries use parameters instead of string concatenation;
- patient and prescription ownership is checked;
- clinical records use restricted foreign keys;
- sensitive environment variables are kept in `.env.local`;
- error responses do not expose credentials or SQL statements.

### Authorization demonstration

Show that:

- an unauthenticated user is redirected to login;
- a receptionist cannot create a consultation;
- a prescriber cannot perform receptionist-only billing actions;
- a non-pharmacovigilance role cannot review or confirm safety reports;
- an unauthorized API request returns an error instead of succeeding.

---

## 11. Testing and verification

The project includes integration tests for:

- ADE and pharmacovigilance workflows;
- consultation creation;
- prescription validation and interaction review;
- receptionist patient and appointment management.

Important verified results include:

- concurrent booking returns one success and one conflict;
- full-text search works;
- ADE ownership and validation checks work;
- ADE embeddings have dimension 384;
- prescription validation, interaction review, idempotency and rollback work;
- patient registration and appointment lifecycle checks work;
- synthetic test fixtures are cleaned up;
- TypeScript checking passes;
- database evidence confirms 15 populated embeddings and zero missing
  embeddings in the local demonstration database.

The detailed record is in [docs/test-results.md](test-results.md).

Run the main checks with:

```powershell
npx tsc --noEmit
npm run build
git diff --check
node --env-file=.env.local --test tests/ade-signal.integration.test.mjs
node --env-file=.env.local --test tests/consultation-api.integration.test.mjs
node --env-file=.env.local --test tests/prescription-api.integration.test.mjs
node --env-file=.env.local --test tests/reception-appointments.integration.test.mjs
```

Only claim a test as passed if it was actually run successfully.

---

## 12. Evidence and report files

Use the project report:

- [Nidaan-DBMS-Project-Report-sql-evidence.pdf](Nidaan-DBMS-Project-Report-sql-evidence.pdf)
- [dbms-project-report-template.html](dbms-project-report-template.html)

Use the SQL and vector screenshots from:

- [docs/screenshots/](screenshots/)

The current terminal evidence covers:

- tables and constraints;
- functions;
- views;
- indexes;
- trigger definitions;
- audit results;
- embedding dimensions;
- embedding counts;
- full-text output;
- vector similarity output.

Application screenshots should be added later for:

1. Login page
2. Receptionist booking
3. Doctor consultation
4. Prescription interaction warning
5. Pharmacovigilance similarity result
6. Admin dashboard
7. Authorization denial
8. Invoice total

Do not include passwords, browser cookies, `.env.local`, `DATABASE_URL`,
`SESSION_SECRET` or private patient information in evidence.

---

## 13. Recommended live presentation order

For a clear ten-to-fifteen-minute demonstration:

1. Introduce the problem and solution.
2. Show the ER diagram and explain the central patient-to-prescription chain.
3. Show the repository and identify schema, trigger, function and route files.
4. Sign in as receptionist and book a synthetic appointment.
5. Sign in as prescriber and save a consultation.
6. Create a prescription and show an interaction warning.
7. Submit an ADE report.
8. Sign in as Pharmacovigilance and show review plus similarity search.
9. Show the signal dashboard.
10. Generate an invoice as receptionist.
11. Show the administrator dashboard and audit log.
12. Show SQL/vector evidence and testing results.
13. Explain security and conclude.

If time is limited, prioritize:

1. ER diagram;
2. appointment-to-consultation-to-prescription workflow;
3. interaction alert;
4. ADE report and vector similarity;
5. one authorization example.

---

## 14. Short viva answers

### Why did you choose PostgreSQL?

Because the project needs relational integrity, transactions, constraints,
triggers, stored functions and joins across clinical entities.

### Why use pgvector instead of only full-text search?

Full-text search depends mainly on matching words. Vector search compares
semantic meaning, so differently worded reports can still be related.

### Why is the interaction pair ordered?

An interaction between drug A and drug B is the same as the reverse pair.
`drug_a_id < drug_b_id` stores one canonical representation and prevents
duplicates.

### Why are triggers used?

Interaction alerts, reminders and audit entries should be generated
automatically whenever the relevant database event occurs. This prevents a
client from accidentally bypassing the behavior.

### Why are patients separate from users?

Patients are clinical records. Only staff members need login accounts and
role-based permissions.

### How is double booking prevented?

The appointment route validates the slot and uses the database serialization
or locking path so concurrent requests cannot both claim the same slot.

### How is the invoice protected from manipulation?

The server calls the database invoice function. The browser does not provide
the final total as a trusted value.

### What is the main security principle?

Authorization is enforced on the server and API, not only by hiding buttons in
the frontend.

### What is the main limitation?

The application records online meeting links and reminder queue rows, but it
does not implement video calling or external SMS/email delivery.

---

## 15. Final conclusion

> Nidaan demonstrates how database design can support a complete clinical
> workflow and also produce useful safety intelligence. PostgreSQL preserves
> the relationships and integrity of the clinic data. Triggers and stored
> functions automate important operations. pgvector extends the relational
> database with semantic search over adverse-event narratives. Together,
> these features make Nidaan more than a CRUD application: it stores clinical
> events, validates them, detects interactions and helps discover safety
> patterns.

