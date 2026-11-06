# Test Results

Record each result and attach evidence when the test is run. Pending cases stay
marked as pending; no result is claimed until the test has actually executed.

| Test | Expected | Actual result | Pass/Fail | Evidence |
|---|---|---|---|---|
| T1 — Two concurrent bookings for the same slot | Exactly one succeeds; the other returns a conflict | One request returned 201 and the competing request returned 409 | PASS | `node --env-file=.env.local --test tests/reception-appointments.integration.test.mjs`; isolated `nidaan_verify` test used two simultaneous requests and cleaned up both fixtures |
| T2 — Prescribe Warfarin to a patient already on Aspirin | `interaction_alert` row created, severity `major`, shown before confirmation | Pending — not run | Pending | Not run; requires PostgreSQL and application session |
| T3 — Confirm an appointment | Two `reminder_queue` rows created (patient + doctor) | Pending — not run | Pending | Not run; requires PostgreSQL |
| T4 — Online appointment with null `meeting_link` | Rejected by CHECK constraint | Pending — not run | Pending | Not run; requires PostgreSQL |
| T5 — In-person appointment with a `meeting_link` | Rejected by CHECK constraint | Pending — not run | Pending | Not run; requires PostgreSQL |
| T6 — Insert `user_account` with role `nurse` | Rejected by CHECK constraint | Pending — not run | Pending | Not run; requires PostgreSQL |
| T7 — Insert the same drug pair in reverse order | Rejected by `drug_a_id < drug_b_id` | Pending — not run | Pending | Not run; requires PostgreSQL |
| T8 — Query "bleeding gums" via full-text search | Misses a report worded "blood while brushing teeth" | Seed full-text query matched the source and excluded the differently worded report | PASS | `node --env-file=.env.local --test tests/ade-signal.integration.test.mjs`; PostgreSQL `narrative_tsv` query and authenticated full-text endpoint |
| T9 — Same query via vector similarity | Retrieves it, similarity > 0.7 | Seed reports have NULL embeddings; a separate synthetic paraphrase was retrieved with similarity above 0.7 | NOT VERIFIED | Isolated test verified the vector endpoint and synthetic 384-dimensional pair; exact seed-vector scenario requires `npm run embed:seed` and a separate run |
| T10 — Delete a patient with prescriptions | Rejected by `ON DELETE RESTRICT` | Pending — not run | Pending | Not run; requires PostgreSQL |
| T11 — Receptionist requests a consultation note | 403 from the API layer | Pending — not run | Pending | Not run; requires authenticated application/API test |
| T12 — Doctor requests the invoice endpoint | 403 | Pending — not run | Pending | Not run; requires authenticated application/API test |
| T13 — Admin requests patient clinical data | 403 | Pending — not run | Pending | Not run; requires authenticated application/API test |
| T14 — Invoice total vs manual calculation | Match to two decimal places | Pending — not run | Pending | Not run; requires PostgreSQL invoice data |
| T15 — `EXPLAIN ANALYZE` similarity query with and without HNSW | Index scan used; measurable improvement | Pending — not run | Pending | Not run; requires PostgreSQL with pgvector and representative data |
| T16 — Signal rate with fewer than 10 exposed patients | Excluded by `HAVING` | Nine synthetic exposures were suppressed; at 10 exposures the row appeared with 2 reports and rate 20.00 | PASS | Same isolated integration test refreshed the materialized view after both exposure counts |

## Additional verification executed — 2026-11-02

These checks are recorded separately because they do not execute all of the exact
T1–T16 scenarios above. Each status below reflects only cases that were actually
executed; other test rows remain pending.

| Check | Actual result | Pass/Fail | Evidence |
|---|---|---|---|
| Consultation timestamp unit tests | 4 passed, 0 failed | PASS | `node --experimental-strip-types --test tests/consultation-timestamps.test.mjs` |
| Consultation API integration | 1 passed, 0 failed; invalid timestamp rejected, omitted optional timestamps saved as NULL, successful creation and duplicate rejection verified | PASS | `node --env-file=.env.local --test tests/consultation-api.integration.test.mjs`; test asserts it is connected to `nidaan_verify` and removes its synthetic fixtures |
| Prescription API integration | 1 passed, 0 failed; required-field and invalid-drug validation, role and ownership denials, interaction review/persistence, idempotent replay, and rollback verified | PASS | `node --env-file=.env.local --test tests/prescription-api.integration.test.mjs`; test asserts it is connected to `nidaan_verify` and removes its synthetic fixtures |
| TypeScript | No diagnostics | PASS | `npx --no-install tsc --noEmit --incremental false` (exit code 0) |
| Whitespace/conflict-marker check | No whitespace errors; existing CRLF conversion warning for `app/doctor/consult/[appointmentId]/page.tsx` | PASS | `git diff --check` (exit code 0) |
| Synthetic-fixture cleanup | 0 matching synthetic patients, users, appointments, or prescription idempotency receipts remained | PASS | Read-only count query against `nidaan_verify` after integration tests |
| Local homepage availability | HTTP 200; accessible tree showed Nidaan heading, description, and Sign in link to `/login` | PASS | Local browser at `http://localhost:3000/`; homepage only, not authenticated workflow testing |
| Production build | Not run in this verification pass | NOT RUN | Prior build attempts were blocked by Windows filesystem permission errors under `.next`; no permissions or build files were changed |
| End-to-end browser workflows | Not run | NOT RUN | No authenticated browser workflow was executed |

## Receptionist registration and appointment management — 2026-11-02

| Check | Actual result | Pass/Fail | Evidence |
|---|---|---|---|
| Patient registration | Synthetic patient created; invalid required/date input rejected; sequential and concurrent duplicate supplied email returned 409; response contained only ID and name; authenticated actor audit row recorded | PASS | `node --env-file=.env.local --test tests/reception-appointments.integration.test.mjs` |
| Appointment list | Receptionist list returned date-filtered appointments with bounded pagination; prescriber results remained scoped to their doctor; phone was not returned | PASS | Same integration test, isolated `nidaan_verify` |
| Booking conflict and concurrency | Existing overlap returned 409; two simultaneous same-slot booking attempts produced exactly one 201 and one 409 | PASS | Same integration test; synthetic fixtures cleaned up and cleanup assertions passed |
| Rescheduling | Invalid/impossible timestamps and conflicting slot rejected; free slot updated successfully | PASS | Same integration test; tests use the booking serialization lock path |
| Cancellation and lifecycle | Booked appointment cancellation succeeded and was idempotent; cancelled appointment was rejected by consultation API with 409 | PASS | Same integration test; appointment audit attribution/history assertions passed |
| Authorization | Anonymous patient registration/list/cancellation denied; prescriber could not reschedule | PASS | Same integration test |
| Test fixture cleanup | No matching synthetic patients or test appointments remained after teardown | PASS | Integration test verifies counts in `nidaan_verify` after cleanup |

## Prescriber ADE and Pharmacovigilance — 2026-11-02

| Check | Actual result | Pass/Fail | Evidence |
|---|---|---|---|
| ADE authorization, JSON/body/date validation, ownership | Anonymous returned 401; JSON null, invalid ID, short narrative, and invalid date returned 400; mismatched patient/item returned 404 | PASS | `node --env-file=.env.local --test tests/ade-signal.integration.test.mjs`; isolated database guard passed |
| ADE item link, embedding, generated full-text vector, and severity | Synthetic linked item persisted; embedding dimensions were 384; generated `narrative_tsv` and severity score were present | PASS | Same isolated integration test queried the saved synthetic ADE rows |
| Unknown suspected item | Optional null item persisted and did not contribute to the drug-specific aggregate | PASS | Same isolated integration test |
| PV inbox/search/review authorization | Anonymous and prescriber denials passed; PV inbox omitted patient identifiers and narratives; review status was saved and attributed to the authenticated PV actor | PASS | Same test against local API and `nidaan_verify` |
| Synthetic vector similarity API | A paraphrased report ranked as a neighbour with cosine similarity > 0.7; returned no patient identifiers | PASS | Same integration test; actual seed reports were not used for this score because their `narrative_vec` values are NULL |
| Signal threshold and refresh | Nine synthetic exposures were suppressed; ten appeared with 2 linked reports and rate 20.00; post-cleanup refresh removed the synthetic drug row | PASS | `npm run migrate:signals`, `npm run refresh:signals`, and isolated ADE integration test with expected database `nidaan_verify` |
| Legacy report preservation | 15 existing ADE reports remained and all 15 remained unlinked | PASS | Read-only pre/post aggregate query against `nidaan_verify` |
