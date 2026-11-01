# Test Results

Record each result and attach evidence when the test is run. The tests below
are pending; no result or evidence is claimed until each test is executed.

| Test | Expected | Actual result | Pass/Fail | Evidence |
|---|---|---|---|---|
| T1 — Two concurrent bookings for the same slot | Exactly one succeeds; the other returns a conflict | Pending — not run | Pending | Not run; no runtime evidence collected |
| T2 — Prescribe Warfarin to a patient already on Aspirin | `interaction_alert` row created, severity `major`, shown before confirmation | Pending — not run | Pending | Not run; requires PostgreSQL and application session |
| T3 — Confirm an appointment | Two `reminder_queue` rows created (patient + doctor) | Pending — not run | Pending | Not run; requires PostgreSQL |
| T4 — Online appointment with null `meeting_link` | Rejected by CHECK constraint | Pending — not run | Pending | Not run; requires PostgreSQL |
| T5 — In-person appointment with a `meeting_link` | Rejected by CHECK constraint | Pending — not run | Pending | Not run; requires PostgreSQL |
| T6 — Insert `user_account` with role `nurse` | Rejected by CHECK constraint | Pending — not run | Pending | Not run; requires PostgreSQL |
| T7 — Insert the same drug pair in reverse order | Rejected by `drug_a_id < drug_b_id` | Pending — not run | Pending | Not run; requires PostgreSQL |
| T8 — Query "bleeding gums" via full-text search | Misses a report worded "blood while brushing teeth" | Pending — not run | Pending | Not run; requires PostgreSQL and seeded reports |
| T9 — Same query via vector similarity | Retrieves it, similarity > 0.7 | Pending — not run | Pending | Not run; requires PostgreSQL and embeddings |
| T10 — Delete a patient with prescriptions | Rejected by `ON DELETE RESTRICT` | Pending — not run | Pending | Not run; requires PostgreSQL |
| T11 — Receptionist requests a consultation note | 403 from the API layer | Pending — not run | Pending | Not run; requires authenticated application/API test |
| T12 — Doctor requests the invoice endpoint | 403 | Pending — not run | Pending | Not run; requires authenticated application/API test |
| T13 — Admin requests patient clinical data | 403 | Pending — not run | Pending | Not run; requires authenticated application/API test |
| T14 — Invoice total vs manual calculation | Match to two decimal places | Pending — not run | Pending | Not run; requires PostgreSQL invoice data |
| T15 — `EXPLAIN ANALYZE` similarity query with and without HNSW | Index scan used; measurable improvement | Pending — not run | Pending | Not run; requires PostgreSQL with pgvector and representative data |
| T16 — Signal rate with fewer than 10 exposed patients | Excluded by `HAVING` | Pending — not run | Pending | Not run; requires PostgreSQL with test data |
