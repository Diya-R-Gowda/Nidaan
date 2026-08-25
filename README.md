# Nidaan

**Consultation Management and Adverse Drug Event Detection**

DBMS Experiential Learning — Level 3 Project
PES University

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [Problem statement](#2-problem-statement)
3. [Objectives](#3-objectives)
4. [Scope](#4-scope)
5. [Why this is not a CRUD application](#5-why-this-is-not-a-crud-application)
6. [User roles](#6-user-roles)
7. [Functional requirements](#7-functional-requirements)
8. [System architecture](#8-system-architecture)
9. [Database choice and justification](#9-database-choice-and-justification)
10. [Entity–relationship design](#10-entityrelationship-design)
11. [Relational schema](#11-relational-schema)
12. [Data dictionary](#12-data-dictionary)
13. [Vector component](#13-vector-component)
14. [Advanced database features](#14-advanced-database-features)
15. [Important queries](#15-important-queries)
16. [Application interface](#16-application-interface)
17. [Security](#17-security)
18. [Data validation and integrity](#18-data-validation-and-integrity)
19. [Setup and execution](#19-setup-and-execution)
20. [Project structure](#20-project-structure)
21. [Testing](#21-testing)
22. [Team and individual contributions](#22-team-and-individual-contributions)
23. [Requirement coverage map](#23-requirement-coverage-map)
24. [Conclusion and future enhancements](#24-conclusion-and-future-enhancements)

---

## 1. What this project is

Nidaan is a clinic management platform that treats routine consultation
workflow as the data source for drug-safety monitoring.

The name is Sanskrit for *diagnosis* in the sense of identifying a root
cause — which is what the analytical half of the system does.

A receptionist books an appointment. A doctor conducts the consultation,
in person or online, and issues a prescription. The system checks that
prescription against a drug-interaction reference table before it is
confirmed. Weeks later, the patient reports an adverse reaction in their
own words. Nidaan finds every earlier report that describes the same
thing — even when the wording is completely different — and expresses the
cluster as a **rate against the number of patients actually exposed to
that drug**, not as a raw count.

Two database paradigms are used, each because the data demands it:

| Paradigm | Engine | Holds |
|---|---|---|
| Relational | PostgreSQL 16 | Patients, doctors, appointments, consultations, prescriptions, drugs, interactions, invoices, reminders, audit trail |
| Vector | pgvector extension | Embeddings of free-text adverse-event narratives |

---

## 2. Problem statement

Adverse drug reactions are systematically under-detected in small and
mid-sized clinics, for three reasons that are all fundamentally database
problems:

**Reaction reports are unstructured.** A patient writes *"purple patches
on both forearms, and bleeding gums when I brush."* Six months earlier a
different patient wrote *"unusual bruising on arms, blood while brushing
teeth."* These are the same clinical event. No keyword search connects
them, because they share almost no vocabulary. `WHERE narrative LIKE
'%bruising%'` finds one and misses the other.

**There is no denominator.** Suppose nine bleeding reports mention
Warfarin. Is that a safety signal? Unanswerable without knowing how many
patients were prescribed Warfarin in the same period. Nine out of four
hundred is background noise. Nine out of twenty-two is an alert. Most
clinic software stores reports and prescriptions in systems that never
speak to each other, so the rate can never be computed.

**Interaction checking happens in a clinician's memory.** Known dangerous
drug pairs are documented in published references, but at the moment of
prescribing, catching one depends on the doctor remembering what else
the patient is currently taking.

Nidaan addresses all three by keeping the entire chain — appointment,
consultation, prescription, reaction report — in one traceable relational
model, and by storing reaction narratives in a form where semantic
similarity is a query rather than a manual review task.

---

## 3. Objectives

1. Model a complete clinic workflow relationally, with enforced referential
   integrity from appointment through to adverse-event report.
2. Prevent double-booking of appointment slots using transactions with
   row-level locking.
3. Detect known drug–drug interactions automatically at the point of
   prescribing, using a database trigger rather than application logic.
4. Store adverse-event narratives as vector embeddings and retrieve
   semantically similar historical cases using cosine similarity.
5. Compute adverse-event rates against true prescription exposure, using
   aggregate queries over the relational data.
6. Enforce role-based access across four distinct user roles.
7. Compute invoice totals server-side using a stored procedure.
8. Queue appointment reminders to both patient and doctor using a trigger.
9. Demonstrate at least four advanced database concepts (this project
   implements seven).

---

## 4. Scope

### In scope

- Four-role authentication and authorization
- Appointment booking for both in-person and online consultation modes
- Consultation records with clinical notes and diagnosis
- Multi-drug prescriptions linked to consultations
- Automatic drug-interaction alerting at prescription time
- Free-text adverse-event reporting by patients or staff
- Semantic similarity retrieval over reaction narratives
- Signal-rate dashboard for the pharmacovigilance officer
- Itemised invoice generation and printable bills
- Reminder queuing for appointments
- Full audit trail of clinical actions

### Out of scope

These are deliberately excluded. The exclusions are as important as the
inclusions, because they keep the project a *database* project.

- **Video calling.** For an online consultation, the database records the
  mode and stores the meeting link. Building WebRTC is not a DBMS exercise.
- **Actual SMS/email delivery.** A database cannot send a message. The
  trigger writes a row into `reminder_queue`; a Next.js route reads that
  queue, dispatches, and marks the row sent. The boundary is explicit.
- **Clinical decision-making.** The system surfaces interactions and
  similar cases. A human decides what they mean.
- **Insurance claim processing, inventory procurement, payroll.**

---

## 5. Why this is not a CRUD application

Requirement 18 asks the project to go beyond Create–Read–Update–Delete.
The following operations have no CRUD equivalent:

| Operation | Why it isn't CRUD |
|---|---|
| Interaction alerting | A trigger evaluates a new prescription item against every drug the patient is currently taking, joined against a reference table of dangerous pairs. The result is a derived warning, not a stored row the user created. |
| Semantic case retrieval | Ranking historical reports by cosine distance in a 384-dimensional space. No `WHERE` clause expresses this. |
| Signal rate computation | An aggregate over two otherwise unrelated tables producing a ratio — reports divided by exposure — that exists in neither. |
| Concurrent slot booking | Correctness depends on transaction isolation, not on writing a row. Two simultaneous writes must produce exactly one success. |
| Invoice computation | Totals are derived from consultation fees plus prescribed drug charges plus tax, computed inside the database. |

A CRUD application stores the adverse-event report. Nidaan notices the
pattern across reports.

---

## 6. User roles

Four roles, each with capabilities the others are denied. Requirement 11
asks for a minimum of two.

### Receptionist
- Create, reschedule and cancel appointments (in-person or online)
- Trigger reminder dispatch to patient and doctor
- Generate and print invoices
- Register new patients
- **Cannot** prescribe, **cannot** read clinical notes or diagnoses

### Prescriber (doctor)
- View own appointment schedule
- Record consultation notes and diagnosis
- Issue prescriptions; sees interaction alerts before confirming
- File adverse-event reports on behalf of patients
- **Cannot** see other doctors' patients, **cannot** issue invoices

### Pharmacovigilance officer
- Read **all** adverse-event reports across all doctors
- Run similarity searches over reaction narratives
- View the signal-rate dashboard
- Confirm or dismiss a signal
- **Cannot** prescribe, **cannot** book appointments

### Administrator
- Manage user accounts and role assignment
- Maintain the drug catalogue and drug-interaction reference table
- Read the audit log
- **Cannot** access patient clinical data at all

Role checks are enforced server-side in the API layer, and the `role`
column itself is constrained at the database level.

---

## 7. Functional requirements

**FR1** — A receptionist shall register a patient with demographic details.

**FR2** — A receptionist shall book an appointment for a patient with a
named doctor at a specified slot, choosing in-person or online mode.

**FR3** — The system shall reject any booking that overlaps an existing
confirmed appointment for the same doctor, even under concurrent requests.

**FR4** — On confirmation of an appointment, the system shall automatically
queue reminders addressed to both the patient and the doctor.

**FR5** — A doctor shall record a consultation against a booked appointment,
capturing notes and diagnosis.

**FR6** — A doctor shall issue a prescription containing one or more drugs,
each with dose, frequency and duration.

**FR7** — On adding a drug to a prescription, the system shall automatically
check it against all drugs the patient is currently taking and raise an
alert if a known interaction exists.

**FR8** — A patient's adverse reaction shall be recorded as free text linked
to the responsible prescription item where known.

**FR9** — On storing a reaction narrative, the system shall generate and
store its vector embedding.

**FR10** — Given a reaction report, the system shall retrieve the *k* most
semantically similar historical reports.

**FR11** — The system shall report, per drug, the number of adverse events
as a proportion of the number of patients prescribed that drug.

**FR12** — A receptionist shall generate an itemised invoice for a completed
consultation, with totals computed server-side.

**FR13** — All clinically significant actions shall be recorded in an audit
log with actor, action and timestamp.

**FR14** — Each user shall access only the functions permitted to their role.

---

## 8. System architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js frontend (App Router, React Server Components) │
│  Receptionist · Doctor · Pharmacovigilance · Admin      │
└───────────────────────────┬─────────────────────────────┘
                            │  fetch
┌───────────────────────────▼─────────────────────────────┐
│  Next.js Route Handlers  (/app/api/**)                  │
│  · session + role guard                                 │
│  · parameterised SQL only                               │
│  · embedding generation before insert                   │
│  · transaction boundaries                               │
└───────────────────────────┬─────────────────────────────┘
                            │  node-postgres (pooled)
┌───────────────────────────▼─────────────────────────────┐
│  PostgreSQL 16                                          │
│  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │ Relational            │  │ Vector (pgvector)      │  │
│  │ 16 tables, FK graph   │  │ ade_report.narrative_  │  │
│  │ triggers, procedures, │  │ vec  vector(384)       │  │
│  │ views, constraints    │  │ HNSW index, cosine     │  │
│  └───────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

The embedding model runs in the API layer, not in the database. Narrative
text arrives at a route handler, is converted to a 384-dimensional vector,
and both text and vector are written in a single `INSERT` inside one
transaction — so they can never drift apart.

---

## 9. Database choice and justification

Requirement 18 states that the choice of paradigm must be justified by the
nature of the data, "rather than being included merely for technology
demonstration." The justification below is per data type, not per feature.

### Why relational for clinical and billing data

Appointments, prescriptions and invoices are rigidly structured, highly
interconnected, and correctness-critical.

- **Referential integrity is non-negotiable.** A prescription item that
  points at a non-existent drug, or an invoice line belonging to no invoice,
  is a data-corruption incident in a clinical setting. Foreign keys make
  these states unrepresentable.
- **Transactions are required.** Booking a slot and preventing a
  double-booking is an isolation problem. So is issuing an invoice, where
  the header and every line must commit together or not at all.
- **The interesting queries are joins and aggregates.** "Adverse events per
  patient exposed, per drug, per quarter" traverses five tables. This is
  what relational algebra was built for.

### Why vector for reaction narratives

Adverse-event narratives are free prose written by non-experts. Two reports
of the same clinical event routinely share no vocabulary.

- Exact matching fails. `LIKE '%bruising%'` misses "purple patches."
- Full-text search improves on this — it handles stemming and word
  frequency — but it still operates on *tokens*. It cannot know that
  "blood while brushing teeth" and "bleeding gums" mean the same thing.
- Embeddings place semantically similar text close together in vector
  space regardless of shared words. Similarity becomes a distance
  computation, and therefore a query.

Full-text search is *also* implemented (a GIN index on a `tsvector` column)
so the two approaches can be contrasted during evaluation — a useful
demonstration of *why* the vector paradigm earns its place.

### Why pgvector rather than a separate vector service

The requirements document lists "PostgreSQL with pgvector" first among
acceptable vector databases. pgvector is an extension that adds a `vector`
column type to PostgreSQL, so the embedding lives on the same table as the
text it was generated from.

The engineering consequences:

- **One connection string**, one pool, one thing to install.
- **Transactional consistency.** The narrative and its embedding are
  inserted atomically. With a separate Qdrant or Pinecone service, deleting
  a report in PostgreSQL leaves an orphaned vector behind unless the
  application remembers to clean up.
- **Filtered similarity search in one query.** "Find the five most similar
  reports, but only for patients over 65" is a single SQL statement with a
  `JOIN` and an `ORDER BY` on vector distance. Across two systems it is
  three round trips and manual result reconciliation.

The honest trade-off: at hundreds of millions of vectors, purpose-built
engines outperform pgvector — they shard across machines and keep more of
the index resident in memory. This project will hold a few thousand
vectors, where the difference is unmeasurable. Selecting a distributed
vector database at this scale would be technology demonstration, which is
precisely what requirement 18 warns against.

Two paradigms — relational and vector — are therefore satisfied within a
single PostgreSQL instance.

---

## 10. Entity–relationship design

### Entities

`user_account`, `patient`, `doctor`, `appointment`, `consultation`,
`drug`, `prescription`, `prescription_item`, `drug_interaction`,
`interaction_alert`, `ade_report`, `invoice`, `invoice_line`,
`reminder_queue`, `audit_log`, `patient_allergy`

### Relationships and cardinalities

| Relationship | Cardinality | Participation |
|---|---|---|
| `user_account` — *is* — `doctor` | 1 : 1 | Total on doctor |
| `patient` — *books* — `appointment` | 1 : N | Partial on patient |
| `doctor` — *attends* — `appointment` | 1 : N | Partial on doctor |
| `user_account` (receptionist) — *creates* — `appointment` | 1 : N | Partial |
| `appointment` — *results in* — `consultation` | 1 : 1 | Partial on appointment |
| `consultation` — *produces* — `prescription` | 1 : N | Partial |
| `prescription` — *contains* — `prescription_item` | 1 : N | Total on item |
| `drug` — *appears in* — `prescription_item` | 1 : N | Partial on drug |
| `drug` — *interacts with* — `drug` (via `drug_interaction`) | M : N recursive | Partial |
| `prescription_item` — *raises* — `interaction_alert` | 1 : N | Partial |
| `prescription_item` — *suspected in* — `ade_report` | 1 : N | Partial |
| `patient` — *files* — `ade_report` | 1 : N | Partial |
| `consultation` — *billed by* — `invoice` | 1 : 1 | Partial |
| `invoice` — *itemised as* — `invoice_line` | 1 : N | Total on line |
| `appointment` — *generates* — `reminder_queue` | 1 : N | Partial |
| `patient` — *has* — `patient_allergy` | 1 : N | Partial |

### Design decisions worth noting

**`drug_interaction` is a recursive M:N relationship** on `drug` — a drug
relates to other drugs. To prevent the same pair being stored twice in
opposite order, a `CHECK (drug_a_id < drug_b_id)` constraint canonicalises
the ordering, and a composite primary key on the pair prevents duplicates.

**`prescription` is separated from `prescription_item`** because a single
prescription routinely contains several drugs, each with its own dose and
duration. Collapsing them would violate 1NF.

**`prescription` hangs off `consultation`, not directly off `patient`.**
Every prescription must be traceable to a visit. This is what makes the
exposure denominator computable.

**`consultation` has a UNIQUE foreign key to `appointment`**, enforcing the
1:1 relationship at the database level rather than by convention.

**Patients are not users.** A patient is a clinical record maintained by
staff, not a login. Only the four staff roles have `user_account` rows.
This was a deliberate scoping decision; adding patient self-service logins
later would mean giving `patient` a nullable `user_id`.

---

## 11. Relational schema

Converted from the ER diagram. Primary keys in **bold**, foreign keys
in *italics*.

```
user_account(**user_id**, email, password_hash, full_name, role,
             is_active, created_at)

doctor(**doctor_id**, *user_id*, registration_no, specialisation,
       consultation_fee)

patient(**patient_id**, full_name, date_of_birth, sex, phone, email,
        blood_group, registered_at)

patient_allergy(**allergy_id**, *patient_id*, substance, severity, noted_at)

appointment(**appointment_id**, *patient_id*, *doctor_id*, *created_by*,
            slot_start, slot_end, mode, meeting_link, status, created_at)

consultation(**consultation_id**, *appointment_id*, chief_complaint,
             notes, diagnosis, started_at, ended_at)

drug(**drug_id**, drug_name, generic_name, drug_class, form,
     strength, unit_price, is_active)

prescription(**prescription_id**, *consultation_id*, issued_at, notes)

prescription_item(**item_id**, *prescription_id*, *drug_id*, dose,
                  frequency, duration_days, quantity)

drug_interaction(**drug_a_id**, **drug_b_id**, severity, mechanism,
                 clinical_effect, reference_source)

interaction_alert(**alert_id**, *item_id*, *conflicting_item_id*,
                  severity, message, raised_at, acknowledged_by,
                  acknowledged_at)

ade_report(**report_id**, *patient_id*, *item_id*, narrative,
           narrative_tsv, narrative_vec, onset_date, reported_at,
           *reported_by*, severity_score, status)

invoice(**invoice_id**, *consultation_id*, *issued_by*, subtotal,
        tax_amount, total, status, issued_at)

invoice_line(**line_id**, *invoice_id*, line_type, description,
             quantity, unit_price, line_total)

reminder_queue(**reminder_id**, *appointment_id*, recipient_type,
               channel, scheduled_for, sent_at, status, attempts)

audit_log(**log_id**, *actor_user_id*, action, entity_type,
          entity_id, details, occurred_at)
```

### Normalisation

All tables are in **third normal form**.

- **1NF** — no repeating groups. Multi-drug prescriptions are decomposed
  into `prescription_item`; invoice items into `invoice_line`.
- **2NF** — no partial dependencies. The only composite key is
  `drug_interaction(drug_a_id, drug_b_id)`, and every non-key attribute
  (severity, mechanism, clinical effect) depends on the *pair*, not on
  either drug alone.
- **3NF** — no transitive dependencies. `unit_price` lives on `drug`, not
  on `prescription_item`. `consultation_fee` lives on `doctor`, not on
  `appointment`.

One deliberate denormalisation: `invoice_line.unit_price` and
`line_total` are stored rather than derived. This is intentional — an
invoice is a financial record and must reflect prices *as they were at
the time of issue*, not as they are now. Recomputing from `drug.unit_price`
would silently rewrite history when a price changes.

---

## 12. Data dictionary

Selected tables. Full DDL is in `db/schema.sql`.

### `user_account`

| Column | Type | Constraints | Description |
|---|---|---|---|
| user_id | SERIAL | PK | Surrogate key |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Login identifier |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash, never plain text |
| full_name | VARCHAR(120) | NOT NULL | |
| role | VARCHAR(30) | NOT NULL, CHECK IN (4 values) | Authorization role |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE | Soft deactivation |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

### `appointment`

| Column | Type | Constraints | Description |
|---|---|---|---|
| appointment_id | SERIAL | PK | |
| patient_id | INT | NOT NULL, FK → patient | |
| doctor_id | INT | NOT NULL, FK → doctor | |
| created_by | INT | NOT NULL, FK → user_account | The receptionist |
| slot_start | TIMESTAMPTZ | NOT NULL | |
| slot_end | TIMESTAMPTZ | NOT NULL, CHECK > slot_start | |
| mode | VARCHAR(20) | NOT NULL, CHECK IN ('in_person','online') | |
| meeting_link | TEXT | NULL; CHECK non-null iff mode='online' | |
| status | VARCHAR(20) | NOT NULL, CHECK IN ('booked','confirmed','completed','cancelled','no_show') | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

### `ade_report`

| Column | Type | Constraints | Description |
|---|---|---|---|
| report_id | SERIAL | PK | |
| patient_id | INT | NOT NULL, FK → patient | |
| item_id | INT | NULL, FK → prescription_item | Suspected cause, if known |
| narrative | TEXT | NOT NULL, CHECK length ≥ 20 | Free-text description |
| narrative_tsv | TSVECTOR | Generated column | For full-text search |
| narrative_vec | vector(384) | | Semantic embedding |
| onset_date | DATE | NOT NULL | |
| reported_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| reported_by | INT | NOT NULL, FK → user_account | |
| severity_score | NUMERIC(4,2) | Computed by stored function | |
| status | VARCHAR(20) | CHECK IN ('new','under_review','confirmed','dismissed') | |

---

## 13. Vector component

Requirement 8 asks five specific questions. Answered in order.

### What data is converted into embeddings

Only `ade_report.narrative` — the patient's or clinician's free-text
description of an adverse reaction. Nothing else is embedded. Structured
fields such as drug name, onset date and severity remain relational,
because exact matching and aggregation are the right operations for them.

Embedding a drug name would be actively wrong: "Warfarin" and "Warfarin
Sodium 5mg" should match exactly or not at all, not approximately.

### Which embedding approach is used

`all-MiniLM-L6-v2`, a sentence-transformer model producing 384-dimensional
dense vectors. Chosen because:

- 384 dimensions keeps index size and query cost low at our data volume
- It runs locally, so no API key, no per-call cost, and no patient
  narrative leaves the machine — which matters for clinical text
- It is trained for sentence-level semantic similarity, which is exactly
  the task

Embeddings are generated in the Next.js API layer via `@xenova/transformers`
(ONNX runtime, no Python dependency).

### How vectors are stored

As a `vector(384)` column on `ade_report`, alongside the source text.
Indexed with HNSW:

```sql
CREATE INDEX idx_ade_narrative_vec
    ON ade_report USING hnsw (narrative_vec vector_cosine_ops);
```

HNSW is an approximate nearest-neighbour index: it navigates a layered
proximity graph instead of scanning every vector, trading a small chance
of missing a true nearest neighbour for a very large speed gain.

### Similarity metric

**Cosine distance**, via the `<=>` operator. Cosine measures the angle
between vectors and ignores magnitude, which is correct here — a long,
rambling narrative and a terse one describing the same reaction should
match. Euclidean distance would penalise the length difference.

### How relevant results are retrieved

The narrative of the report under review is embedded, then:

```sql
SELECT r.report_id, r.narrative, r.onset_date,
       1 - (r.narrative_vec <=> $1) AS similarity
FROM ade_report r
WHERE r.report_id <> $2
ORDER BY r.narrative_vec <=> $1
LIMIT 10;
```

Because the vectors live in the same database as everything else, the
search can be filtered and joined in the same statement — see
[Important queries](#15-important-queries).

---

## 14. Advanced database features

Requirement 7 asks for at least four. Seven are implemented.

### 1. Transactions — concurrent appointment booking

The scenario: two receptionists click the same 10:30 slot simultaneously.
Without isolation, both `INSERT`s succeed and the doctor is double-booked.

```sql
BEGIN;

SELECT 1
FROM appointment
WHERE doctor_id = $1
  AND status IN ('booked','confirmed')
  AND tstzrange(slot_start, slot_end) && tstzrange($2, $3)
FOR UPDATE;

-- if a row was returned, ROLLBACK and report the conflict

INSERT INTO appointment (patient_id, doctor_id, created_by,
                         slot_start, slot_end, mode, status)
VALUES ($4, $1, $5, $2, $3, $6, 'booked');

COMMIT;
```

`FOR UPDATE` locks the matching rows for the duration of the transaction,
forcing the second request to wait and then correctly observe the conflict.

This is demonstrable live: open two browser tabs, submit both bookings,
and exactly one succeeds.

### 2. Triggers

**`trg_check_interaction`** — `AFTER INSERT ON prescription_item`. Looks up
every other drug the patient is currently taking, joins against
`drug_interaction`, and writes an `interaction_alert` row for each match.
The doctor's UI polls for alerts before allowing the prescription to be
confirmed.

**`trg_queue_reminders`** — `AFTER UPDATE ON appointment` where status
changes to `confirmed`. Inserts two `reminder_queue` rows: one addressed to
the patient, one to the doctor, scheduled 24 hours before `slot_start`.

**`trg_audit_prescription`** — `AFTER INSERT OR UPDATE ON prescription`.
Writes to `audit_log`.

> **Boundary note.** The trigger *queues* the reminder. It does not send it.
> A database cannot dispatch SMS or email. A Next.js route handler polls
> `reminder_queue`, dispatches, and stamps `sent_at`. Stating this
> correctly during evaluation demonstrates understanding of where the
> database ends.

### 3. Stored procedures and functions

**`fn_compute_invoice(consultation_id)`** — sums the doctor's consultation
fee plus every prescribed drug's `quantity × unit_price`, applies tax,
inserts the `invoice` header and all `invoice_line` rows, and returns the
invoice id. All inside one transaction.

Totals are computed **in the database, never in JavaScript**. A total
computed in the frontend can be tampered with and is not a database
demonstration.

**`fn_severity_score(report_id)`** — derives a numeric severity from
narrative length, presence of flagged terms, patient age and drug
interaction severity.

**`fn_signal_rate(drug_id, from_date, to_date)`** — returns reports,
exposed patient count, and the rate.

### 4. Views

**`vw_drug_signal_rates`** (materialized) — per drug: distinct patients
prescribed, adverse-event count, and rate per hundred exposed. Refreshed
on a schedule.

**`vw_doctor_schedule`** — a doctor's upcoming appointments joined with
patient names and consultation status.

**`vw_pending_reminders`** — reminders due within the next hour.

### 5. Indexing

| Index | Type | Purpose |
|---|---|---|
| `idx_ade_narrative_vec` | HNSW | Vector similarity search |
| `idx_ade_narrative_tsv` | GIN | Full-text search |
| `idx_appt_doctor_slot` | B-tree composite | Slot conflict detection |
| `idx_item_drug` | B-tree | Exposure counting per drug |
| `idx_appt_status` | Partial | Active appointments only |

### 6. Full-text search

A generated `tsvector` column with a GIN index, providing keyword search
over narratives. Retained deliberately as a **comparison baseline** — the
evaluation demonstrates a query where full-text search fails and vector
search succeeds, which is the clearest possible justification for the
second paradigm.

### 7. Vector similarity search

Covered in [section 13](#13-vector-component).

---

## 15. Important queries

### Adverse-event rate per drug, against true exposure

The query the whole project exists for.

```sql
SELECT d.drug_name,
       COUNT(DISTINCT c.patient_id)                    AS patients_exposed,
       COUNT(DISTINCT a.report_id)                     AS adverse_events,
       ROUND(COUNT(DISTINCT a.report_id) * 100.0
             / NULLIF(COUNT(DISTINCT c.patient_id), 0), 2) AS rate_per_100
FROM drug d
JOIN prescription_item pi ON pi.drug_id = d.drug_id
JOIN prescription p       ON p.prescription_id = pi.prescription_id
JOIN consultation c       ON c.consultation_id = p.consultation_id
LEFT JOIN ade_report a    ON a.item_id = pi.item_id
GROUP BY d.drug_id, d.drug_name
HAVING COUNT(DISTINCT c.patient_id) >= 10
ORDER BY rate_per_100 DESC;
```

Demonstrates `JOIN`, `LEFT JOIN`, `GROUP BY`, `HAVING`, `ORDER BY`,
aggregate functions and `NULLIF`.

### Filtered semantic search

Similar reports, restricted to elderly patients — one statement, joining
relational filters to a vector ranking. This is the query that would
require three round trips against a separate vector service.

```sql
SELECT r.report_id, r.narrative, p.full_name,
       1 - (r.narrative_vec <=> $1) AS similarity
FROM ade_report r
JOIN patient p ON p.patient_id = r.patient_id
WHERE date_part('year', age(p.date_of_birth)) >= 65
  AND r.report_id <> $2
ORDER BY r.narrative_vec <=> $1
LIMIT 5;
```

### Patients on interacting drug pairs — recursive M:N with subquery

```sql
SELECT p.full_name, d1.drug_name AS drug_a, d2.drug_name AS drug_b,
       di.severity
FROM drug_interaction di
JOIN drug d1 ON d1.drug_id = di.drug_a_id
JOIN drug d2 ON d2.drug_id = di.drug_b_id
JOIN prescription_item i1 ON i1.drug_id = di.drug_a_id
JOIN prescription_item i2 ON i2.drug_id = di.drug_b_id
JOIN prescription pr1 ON pr1.prescription_id = i1.prescription_id
JOIN prescription pr2 ON pr2.prescription_id = i2.prescription_id
JOIN consultation c1 ON c1.consultation_id = pr1.consultation_id
JOIN consultation c2 ON c2.consultation_id = pr2.consultation_id
JOIN appointment a1 ON a1.appointment_id = c1.appointment_id
JOIN appointment a2 ON a2.appointment_id = c2.appointment_id
JOIN patient p ON p.patient_id = a1.patient_id
WHERE a2.patient_id = a1.patient_id
  AND di.severity = 'major'
  AND i1.item_id <> i2.item_id;
```

### Doctors whose adverse-event rate exceeds the clinic average

```sql
SELECT doc.doctor_id, u.full_name, COUNT(r.report_id) AS reports
FROM doctor doc
JOIN user_account u ON u.user_id = doc.user_id
JOIN appointment a  ON a.doctor_id = doc.doctor_id
JOIN consultation c ON c.appointment_id = a.appointment_id
JOIN prescription p ON p.consultation_id = c.consultation_id
JOIN prescription_item pi ON pi.prescription_id = p.prescription_id
LEFT JOIN ade_report r ON r.item_id = pi.item_id
GROUP BY doc.doctor_id, u.full_name
HAVING COUNT(r.report_id) > (
    SELECT AVG(cnt) FROM (
        SELECT COUNT(r2.report_id) AS cnt
        FROM ade_report r2
        GROUP BY r2.reported_by
    ) sub
);
```

Demonstrates a correlated aggregate subquery in `HAVING`.

---

## 16. Application interface

Next.js App Router. Each role sees a different dashboard after login.

### Receptionist
- **Appointment calendar** — day and week view, drag to reschedule
- **Booking form** — patient search, doctor selection, slot picker,
  in-person/online toggle revealing a meeting-link field
- **Reminder panel** — pending queue, dispatch button, sent status
- **Billing** — itemised invoice preview and printable view
- **Patient registration**

### Doctor
- **Today's schedule** — from `vw_doctor_schedule`
- **Consultation screen** — complaint, notes, diagnosis
- **Prescription builder** — drug autocomplete, dose/frequency/duration;
  **interaction alerts appear inline before confirmation**
- **Adverse-event reporting form**

### Pharmacovigilance officer
- **Signal dashboard** — drug-wise rates, sortable, with a bar chart
- **Report inbox** — new reports awaiting review
- **Report detail** — the narrative alongside its ten nearest neighbours
  by cosine similarity, each with a similarity score
- **Comparison toggle** — same query run through full-text search, to show
  the difference
- **Confirm / dismiss signal**

### Administrator
- **User management** — accounts, roles, activation
- **Drug catalogue** — CRUD on `drug`
- **Interaction reference** — CRUD on `drug_interaction`
- **Audit log viewer** — filterable

---

## 17. Security

- **Passwords are bcrypt-hashed** with a per-password salt, cost factor 12.
  The column is named `password_hash`, never `password`. Plain text is never
  stored, logged, or returned by any API route.
- **No hard-coded credentials.** All configuration comes from environment
  variables. `.env.local` is gitignored; `.env.example` documents the
  required keys with placeholder values.
- **Parameterised queries throughout.** Every query uses `$1, $2` bound
  parameters via node-postgres. No string concatenation into SQL, so SQL
  injection is structurally impossible.
- **Server-side authorization.** Role checks run in route handlers, not in
  the React layer. Hiding a button is not access control.
- **Least privilege at the database level.** The application connects as a
  role with `SELECT/INSERT/UPDATE` on application tables and no `DROP` or
  `ALTER` rights. Migrations run under a separate owner role.
- **Sessions** are httpOnly, secure, sameSite cookies with server-side
  expiry.
- **Audit trail.** Clinically significant actions are recorded with actor
  and timestamp.

---

## 18. Data validation and integrity

Requirement 12 asks for validation **at the database level**. Application
validation is a convenience for the user; database validation is what
actually guarantees correctness.

**Domain constraints**

```sql
role       CHECK (role IN ('receptionist','prescriber',
                           'pharmacovigilance','admin'))
mode       CHECK (mode IN ('in_person','online'))
status     CHECK (status IN ('booked','confirmed','completed',
                             'cancelled','no_show'))
slot_end   CHECK (slot_end > slot_start)
quantity   CHECK (quantity > 0)
unit_price CHECK (unit_price >= 0)
narrative  CHECK (char_length(narrative) >= 20)
```

**Conditional constraint** — an online appointment must carry a link:

```sql
CHECK ((mode = 'online'  AND meeting_link IS NOT NULL)
    OR (mode = 'in_person' AND meeting_link IS NULL))
```

**Canonical ordering** on the recursive interaction relationship, so a pair
cannot be stored twice in opposite order:

```sql
CHECK (drug_a_id < drug_b_id)
```

**Uniqueness** — `user_account.email`, `doctor.registration_no`,
`consultation.appointment_id` (enforcing 1:1).

**Referential actions** — `ON DELETE RESTRICT` on all clinical foreign
keys. Deleting a patient with prescriptions must fail loudly, not cascade
silently. Historical clinical data is not deletable by design; records are
deactivated instead.

**Transactional consistency** — invoice header and lines commit together;
narrative and embedding insert together.

---

## 19. Setup and execution

### Prerequisites

- Node.js 20+
- PostgreSQL 16 with the `pgvector` extension available
- Git

### 1. Clone

```bash
git clone https://github.com/<org>/nidaan.git
cd nidaan
npm install
```

### 2. Create the database

```bash
createdb nidaan
psql -d nidaan -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

If `CREATE EXTENSION vector` fails, pgvector is not installed. On Ubuntu:

```bash
sudo apt install postgresql-16-pgvector
```

On macOS with Homebrew: `brew install pgvector`.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/nidaan
SESSION_SECRET=<generate a random 32-byte string>
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

`.env.local` is gitignored and must never be committed.

### 4. Build the schema

```bash
psql -d nidaan -f db/01_schema.sql       # DDL: tables, constraints, indexes
psql -d nidaan -f db/02_triggers.sql     # trigger functions and triggers
psql -d nidaan -f db/03_procedures.sql   # stored functions
psql -d nidaan -f db/04_views.sql        # views and materialized views
psql -d nidaan -f db/05_seed.sql         # drugs, interactions, demo users
```

### 5. Generate embeddings for seed narratives

```bash
npm run embed:seed
```

Reads every `ade_report` with a null `narrative_vec`, generates the
embedding, and updates the row.

### 6. Run

```bash
npm run dev
```

Open http://localhost:3000.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Receptionist | reception@nidaan.local | *see `db/05_seed.sql`* |
| Doctor | doctor@nidaan.local | *see `db/05_seed.sql`* |
| Pharmacovigilance | pv@nidaan.local | *see `db/05_seed.sql`* |
| Admin | admin@nidaan.local | *see `db/05_seed.sql`* |

---

## 20. Project structure

```
nidaan/
├── db/
│   ├── 01_schema.sql
│   ├── 02_triggers.sql
│   ├── 03_procedures.sql
│   ├── 04_views.sql
│   ├── 05_seed.sql
│   └── queries/                  demonstration queries
├── app/
│   ├── (auth)/login/
│   ├── reception/                calendar, booking, reminders, billing
│   ├── doctor/                   schedule, consultation, prescribing
│   ├── pharmacovigilance/        dashboard, inbox, similarity
│   ├── admin/                    users, drugs, interactions, audit
│   └── api/
│       ├── appointments/
│       ├── consultations/
│       ├── prescriptions/
│       ├── ade-reports/
│       ├── invoices/
│       └── reminders/
├── lib/
│   ├── db.ts                     connection pool
│   ├── auth.ts                   bcrypt, sessions, role guards
│   └── embeddings.ts             narrative → vector(384)
├── docs/
│   ├── er-diagram.png
│   ├── relational-schema.png
│   └── screenshots/
├── .env.example
└── README.md
```

---

## 21. Testing

| # | Test | Expected |
|---|---|---|
| T1 | Two concurrent bookings for the same slot | Exactly one succeeds; the other returns a conflict |
| T2 | Prescribe Warfarin to a patient already on Aspirin | `interaction_alert` row created, severity `major`, shown before confirmation |
| T3 | Confirm an appointment | Two `reminder_queue` rows created (patient + doctor) |
| T4 | Online appointment with null `meeting_link` | Rejected by CHECK constraint |
| T5 | In-person appointment with a `meeting_link` | Rejected by CHECK constraint |
| T6 | Insert `user_account` with role `nurse` | Rejected by CHECK constraint |
| T7 | Insert the same drug pair in reverse order | Rejected by `drug_a_id < drug_b_id` |
| T8 | Query "bleeding gums" via full-text search | Misses a report worded "blood while brushing teeth" |
| T9 | Same query via vector similarity | Retrieves it, similarity > 0.7 |
| T10 | Delete a patient with prescriptions | Rejected by `ON DELETE RESTRICT` |
| T11 | Receptionist requests a consultation note | 403 from the API layer |
| T12 | Doctor requests the invoice endpoint | 403 |
| T13 | Admin requests patient clinical data | 403 |
| T14 | Invoice total vs manual calculation | Match to two decimal places |
| T15 | `EXPLAIN ANALYZE` similarity query with and without HNSW | Index scan used; measurable improvement |
| T16 | Signal rate with fewer than 10 exposed patients | Excluded by `HAVING` |

Record actual results in `docs/test-results.md` as you run them.

---

## 22. Team and individual contributions

Two-member team. Requirement 2 requires both members to contribute to
**both** database and application development, so responsibilities are
split by feature vertical rather than by layer.

### Member A — *(name)*
**Clinical vertical.** `doctor`, `consultation`, `prescription`,
`prescription_item`, `drug`, `drug_interaction`, `interaction_alert`
tables and DDL. The interaction-checking trigger. The doctor dashboard,
consultation screen and prescription builder UI plus their API routes.

### Member B — *(name)*
**Front-desk and safety vertical.** `patient`, `appointment`, `invoice`,
`invoice_line`, `reminder_queue`, `ade_report`, `audit_log` tables and DDL.
The booking transaction, reminder trigger, invoice stored procedure, and
the pgvector integration. The receptionist and pharmacovigilance
dashboards plus their API routes.

### Shared
ER diagram, relational schema, normalisation review, seed data,
integration testing, documentation.

Git history reflects this split; each member's commits are attributed to
their own account.

---

## 23. Requirement coverage map

| # | Requirement | Where it is satisfied |
|---|---|---|
| 1 | Unique title, real-world problem, not simple CRUD | §1, §2, §5 |
| 2 | Two-member team, defined responsibilities | §22 |
| 3 | Two database paradigms | PostgreSQL + pgvector — §9 |
| 4 | ER diagram → relational schema | §10, §11, `docs/er-diagram.png` |
| 5 | DDL: CREATE, ALTER, DROP, keys, constraints, indexes, views | `db/01_schema.sql`, §14.5 |
| 6 | DML with JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | §15 |
| 7 | Four advanced concepts (seven implemented) | §14 |
| 8 | Vector embeddings and similarity search | §13 |
| 9 | Next.js interface | §16 |
| 10 | API layer, no hard-coded credentials, env vars | §8, §17 |
| 11 | Authentication and ≥2 roles | §6 — four roles |
| 12 | Database-level validation and integrity | §18 |
| 13 | Security, no plain-text passwords | §17 |
| 14 | Documentation | This file |
| 15 | Git/GitHub with individual commits and README | §22, this file |
| 16 | Demonstration coverage | §14, §15, §16, §21 |
| 17 | Originality | Original problem framing, schema and implementation |
| 18 | Beyond CRUD, justified paradigm choice | §5, §9 |

---

## 24. Conclusion and future enhancements

Nidaan demonstrates that a clinic's ordinary operational data — who was
seen, by whom, and what they were prescribed — is exactly what drug-safety
monitoring needs, and that the reason clinics cannot do this monitoring is
usually a data-modelling failure rather than a clinical one.

The project's central design claim is that the two halves are not separate
modules. The appointment and consultation records that look like
conventional clinic software are what supply the exposure denominator, and
without that denominator the adverse-event analysis would produce counts
that mean nothing.

The paradigm split follows the same logic. Prescriptions need foreign keys,
constraints and transactions. Reaction narratives need semantic proximity.
Neither paradigm can do the other's job well, and holding both in one
PostgreSQL instance keeps them transactionally consistent and jointly
queryable.

### Future enhancements

- **Temporal signal detection** — flag a drug whose adverse-event rate rises
  sharply within a rolling window, rather than reporting cumulative rates.
- **Narrative clustering** — group reports by embedding proximity to
  discover reaction *types* that nobody defined in advance.
- **Patient self-service portal** — patients report reactions directly,
  requiring `patient.user_id` and a fifth role.
- **Standardised terminology** — map narratives to MedDRA preferred terms
  for interoperability with national reporting systems.
- **Regulatory export** — generate E2B-format reports for submission to a
  national pharmacovigilance programme.
- **Read replica** for the pharmacovigilance dashboard, so analytical
  queries never contend with clinical writes.

---

*Nidaan · DBMS Experiential Learning Level 3 · PES University*
