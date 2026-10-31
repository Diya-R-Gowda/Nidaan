I could only see `README.md` from the repo, not the `db/*.sql` files, the `app/` folder or the screenshots. So the split below follows the README's structure, and you should check the file names against your actual repo as you go. I've also split by the same "vertical" idea as README §22, so both of you touch both database and application work, which is requirement 2.

## The split at a glance

| # | Report section | Owner | Effort |
|---|---|---|---|
| 1 | Title | Diya (assembles) | Small |
| 2 | Students' SRN and names | Diya (assembles), Chetha sends her SRN | Small |
| 3 | Abstract | **Diya** | Small |
| 4 | Tech stack | **Diya** | Small |
| 5a | SQL: DDL (tables, constraints, indexes, ALTER/DROP) | **Diya** | Large |
| 5b | SQL: triggers | **Diya** | Medium |
| 5c | SQL: stored functions, views, DML queries | **Chetha** | Large |
| 6 | NoSQL/Vector commands | **Chetha** | Medium |
| 7 | Next.js project tree | **Chetha** | Small |
| 8 | Screenshots, part 1: Doctor + Admin screens and their code | **Diya** | Medium |
| 8 | Screenshots, part 2: Receptionist + Pharmacovigilance screens and their code | **Chetha** | Medium |
| 9 | Evaluation rubrics: completion status | **Chetha** | Medium |
| – | Final assembly, formatting and PDF export | **Diya** | Small |
| – | Final proofreading of the whole report | **Chetha** | Small |

Diya takes the heavier SQL (5a, 5b) plus the short text sections. Chetha takes the other half of the SQL, the vector part, and the tree and rubrics. The screenshots are split by role.

**Ground rules for both of you**
- Run every command yourself and screenshot the real output. Don't paste commands you haven't run.
- Use one font for code (Consolas or Courier New, 10pt) and the same caption style: "Figure 5.3: Output of `\d appointment`".
- Write your sections in a separate Word or Google Doc and send them to Diya for merging. Use the headings exactly as in the 9-point list.
- Aim to finish a day before the deadline so there is time to proofread.

---

## Diya's part

### 1 and 2: Title and SRNs (cover page)
Put on one page:
- Project title: **Nidaan: Consultation Management and Adverse Drug Event Detection**
- Course: DBMS Experiential Learning, Level 3, PES University
- Team table with columns Name, SRN, Section, Contribution. Your row is Diya R Gowda, PES1UG24CS159, 5 'C'. Ask Chetha for her SRN and section.
- Add each member's contribution, one line each, copied from README §22 (Member A and Member B).

### 3: Abstract (150 to 250 words, one paragraph)
Write it in this order, using README §1, §2 and §24:
1. **Problem:** adverse drug reactions go undetected in small clinics. Reports are unstructured, there's no exposure denominator, and interaction checks depend on memory.
2. **Solution:** Nidaan keeps the full chain (appointment, consultation, prescription, reaction report) in one relational model.
3. **Method:** PostgreSQL for the clinic data, with a trigger for interaction alerts and transactions for booking. pgvector stores 384-dimensional embeddings of reaction narratives for semantic search.
4. **Result:** adverse events are reported as a rate against the number of patients actually exposed.
5. **Scope:** four user roles and a Next.js interface.

Write it in your own words rather than copying README sentences, and avoid bullet points.

### 4: Tech stack
Make a table with columns Layer, Technology and Why. Rows:
- Frontend: Next.js (App Router)
- API: Next.js route handlers
- DB driver: node-postgres
- Relational DB: PostgreSQL 16
- Vector extension: pgvector (HNSW index, cosine distance)
- Embedding model: `all-MiniLM-L6-v2` via `@xenova/transformers`
- Auth: bcrypt and httpOnly session cookies
- Tools: Git/GitHub, psql

To get the exact versions, run `node -v`, `psql --version`, and open `package.json` to read the versions of Next.js, `pg`, `bcrypt` and `@xenova/transformers`. Use those numbers in the table. Add two lines on why you chose PostgreSQL with pgvector (README §9).

### 5a: SQL DDL commands
Do this in `psql -d nidaan`. For each item, put the **command** in a code block and a **screenshot of the output** below it.

1. **CREATE TABLE.** Open `db/01_schema.sql` and copy the CREATE TABLE statements into the report. If there are too many, include 4 or 5 in full: `user_account`, `appointment`, `prescription_item`, `drug_interaction`, `ade_report`. Reference the rest as "see Appendix / `db/01_schema.sql`". Then run `\dt` and screenshot the list of 16 tables.
2. **Constraints.** Quote the constraint lines (see README §18) and screenshot the proof:
   - `\d appointment` shows the CHECK constraints, FKs and the meeting-link rule.
   - `\d drug_interaction` shows the composite PK and `drug_a_id < drug_b_id`.
3. **Failing-constraint tests.** Run these live and screenshot the error each time (README tests T4 to T7 and T10):
   - an online appointment with a NULL link
   - an in-person appointment with a link
   - a user with role `nurse`
   - a drug pair in reverse order
   - deleting a patient who has prescriptions
4. **Indexes.** Run `\di` and screenshot, then list the five from README §14.5 with a one-line purpose each.
5. **ALTER and DROP.** The rubric lists these, so show them. On a scratch table, not your real ones:
   ```sql
   CREATE TABLE demo_tmp (id INT PRIMARY KEY, note TEXT);
   ALTER TABLE demo_tmp ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
   ALTER TABLE demo_tmp ADD CONSTRAINT chk_note CHECK (char_length(note) > 3);
   ALTER TABLE demo_tmp DROP COLUMN created_at;
   DROP TABLE demo_tmp;
   ```
   Screenshot each result.
6. **ER diagram and relational schema.** Insert `docs/er-diagram.png` and `docs/relational-schema.png` at the start of this section. If they aren't made yet, make them now.

### 5b: SQL triggers
From `db/02_triggers.sql`, for each of the three triggers (`trg_check_interaction`, `trg_queue_reminders`, `trg_audit_prescription`), include:
- the function and trigger code
- a **before and after demo**

Demo scripts:
- **Interaction trigger (T2).** Prescribe Warfarin to a patient already on Aspirin. Then `SELECT * FROM interaction_alert ORDER BY raised_at DESC LIMIT 3;` and screenshot the alert row with severity `major`.
- **Reminder trigger (T3).** `UPDATE appointment SET status='confirmed' WHERE appointment_id = <id>;` then `SELECT * FROM reminder_queue WHERE appointment_id = <id>;` and screenshot the two rows (patient and doctor).
- **Audit trigger.** Insert a prescription, then `SELECT * FROM audit_log ORDER BY occurred_at DESC LIMIT 3;`.

Also write one sentence on the boundary: the trigger queues the reminder and the Next.js route sends it (README §14.2).

### 8, part 1: Screenshots for the Doctor and Admin roles
For each screenshot, put a **short code excerpt** (the route handler or component behind it) next to it. That shows application code and demo together, as the format asks.

| Screenshot | Code excerpt to pair with it |
|---|---|
| Login page | `lib/auth.ts` (bcrypt compare, session) |
| Doctor: today's schedule | `app/doctor/…` and the `vw_doctor_schedule` query |
| Doctor: consultation screen | the `app/api/consultations` route |
| Doctor: prescription builder showing an **interaction alert** inline | the `app/api/prescriptions` route |
| Doctor: adverse-event form | `app/api/ade-reports` insert (text and vector in one INSERT) |
| Admin: user management, drug catalogue, audit log | the `app/admin/…` code |
| Role block: the doctor calling the invoice endpoint returns 403 (T12), and the admin requesting clinical data returns 403 (T13) | `lib/auth.ts` role guard |

For the 403 screenshots, use the browser dev tools Network tab or Postman. Crop screenshots tightly, 2 to 3 per page maximum.

### Final assembly
When Chetha's sections arrive, merge in this order: 1, 2, 3, 4, 5, 6, 7, 8, 9. Check that figure numbers run in sequence, add a table of contents, export to PDF, and check the page breaks.

---

## Chetha's part

### 5c: Stored functions, views and DML queries

**Stored functions** (from `db/03_procedures.sql`). For `fn_compute_invoice`, `fn_severity_score` and `fn_signal_rate`, give the code and then a demo:
- `SELECT fn_compute_invoice(<consultation_id>);` Then run `SELECT * FROM invoice_line WHERE invoice_id = <id>;` and screenshot it.
- **T14.** Calculate the total by hand: doctor fee plus the sum of quantity times unit price, plus tax. Show that it matches the stored total to two decimal places. A small table "Manual vs database total" works well here.
- `SELECT fn_severity_score(<report_id>);` and `SELECT * FROM fn_signal_rate(<drug_id>, '2026-01-01', '2026-12-31');`

**Views** (from `db/04_views.sql`). For each of `vw_drug_signal_rates` (materialized), `vw_doctor_schedule` and `vw_pending_reminders`, give the CREATE VIEW code and a `SELECT * FROM … LIMIT 10;` screenshot. For the materialized view, also show `REFRESH MATERIALIZED VIEW vw_drug_signal_rates;`.

**Transaction demo (T1).** This is the marker's favourite. Open two `psql` windows side by side. In window 1, run `BEGIN;` and the FOR UPDATE check and insert, without committing. In window 2, run the same booking. It will wait. Then `COMMIT;` in window 1 and show window 2 reporting the conflict. Screenshot both windows together. Include the transaction code from README §14.1.

**DML queries** (README §15, plus `db/queries/`). Run all four queries and screenshot the results:
1. Adverse-event rate per drug (JOIN, LEFT JOIN, GROUP BY, HAVING, aggregates)
2. Filtered semantic search (this is the vector query, which you also use in section 6)
3. Patients on interacting drug pairs
4. Doctors above the clinic average (subquery in HAVING)

Under each, add one line: "Demonstrates: …", copied from the README.

Make sure the seed data gives each query non-empty output. If a result is empty, fix the seed data first. **T16:** also show a drug with fewer than 10 exposed patients being dropped by HAVING.

### 6: NoSQL / vector database commands
In the report, say clearly that the vector paradigm is **pgvector inside PostgreSQL**, and why (README §9). Then show each command with its screenshot:

1. **Enable the extension:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   \dx
   ```
2. **Vector column:** `\d ade_report` shows `narrative_vec vector(384)`.
3. **HNSW index:**
   ```sql
   CREATE INDEX idx_ade_narrative_vec ON ade_report USING hnsw (narrative_vec vector_cosine_ops);
   ```
4. **Embedding generation:** `npm run embed:seed`, plus the code from `lib/embeddings.ts`. Then:
   ```sql
   SELECT report_id, vector_dims(narrative_vec) FROM ade_report LIMIT 5;
   ```
   It should print 384.
5. **Similarity search:** the cosine query with `<=>` from README §13, with a real report ID and its similarity scores in the screenshot.
6. **Full-text vs vector comparison (T8 and T9).** Search "bleeding gums" with full-text:
   ```sql
   SELECT report_id, narrative FROM ade_report
   WHERE narrative_tsv @@ plainto_tsquery('english', 'bleeding gums');
   ```
   It misses the "blood while brushing teeth" report. Then run the vector query, which finds it with similarity above 0.7. Put the two results in a side-by-side table. **This is your strongest evidence**, so give it a full page.
7. **EXPLAIN ANALYZE (T15).** Run the similarity query twice, once with the index and once after `DROP INDEX idx_ade_narrative_vec;` (or `SET enable_indexscan = off;`). Screenshot both plans and note the times. Then recreate the index.

Write one paragraph each on the five questions of README §13: what is embedded, which model, how it's stored, which metric, how results are retrieved. Rephrase them in your own words.

### 7: Next.js project tree
In the project root, run one of:
```bash
# Mac/Linux
tree -I 'node_modules|.next|.git' -L 3
# Windows (cmd)
tree /F
# Any OS, no install needed
npx tree-node-cli -I "node_modules|.next|.git" -L 3
```
If the output is too long, trim it by hand. Paste it as a code block, not a screenshot, and compare it with the tree in README §20. Add a one-line annotation next to each main folder (`db/`, `app/reception`, `app/api`, `lib/`, `docs/`), as the README does. The tree should match what's actually in the repo.

### 8, part 2: Screenshots for the Receptionist and Pharmacovigilance roles

| Screenshot | Code excerpt to pair with it |
|---|---|
| Receptionist: appointment calendar | `app/reception/…` |
| Booking form with online toggle showing the meeting-link field | the `app/api/appointments` route with the transaction |
| Booking conflict message (two tabs, one fails) | same route, the conflict branch |
| Reminder panel (queued, then sent) | the `app/api/reminders` route |
| Invoice preview and printable bill | the `app/api/invoices` route calling `fn_compute_invoice` |
| Patient registration | the patients route |
| PV: signal dashboard with the bar chart | the signal-rate query |
| PV: report detail showing the ten nearest neighbours with similarity scores | the similarity route |
| PV: full-text vs vector comparison toggle | the same route, both branches |
| Role block: the receptionist requesting a consultation note returns 403 (T11) | the role guard |

### 9: Evaluation rubrics, completion status
You don't have the rubric sheet in the repo, so ask your faculty or look in the course portal for the official rubric list. Until you have it, use the 18 requirements from README §23 as the rows.

Make a table with columns **#, Requirement, Status, Evidence (section or file)**. Status must be one of Completed, Partially completed or Not completed. Rules:
- Mark **Completed** only if you have run the feature and have a screenshot of it. The README is a plan; the report must reflect what actually works.
- Use the test table T1 to T16 from README §21 as evidence. Add a second table: Test, Expected, **Actual result**, Pass/Fail. Fill in actual results as you run them, and put the same results in `docs/test-results.md`.
- Anything that isn't built yet goes in as "Partially completed" or "Not completed" with a one-line note. That is better than a false "Completed", and anything unfinished can go under future work.

Finish with an overall completion line, for example "16 of 18 requirements completed".

### Proofreading
Once Diya sends the merged PDF, read all of it for consistency: names, figure numbers, command output that matches the code, and that every section in the 9-point list is present.

---

## Before you start (both of you)
1. Pull the latest from GitHub so you work from the same code.
2. Reset and rebuild the database once from the `db/01` to `db/05` scripts and run `npm run embed:seed`. That way the outputs in both your screenshots come from the same data.
3. If a test or screenshot fails, fix the bug first and note it in the rubric table. Don't hide it.

If you share the `db/*.sql` files or the `app/` tree, I can check the commands above against your real names and write the abstract draft for Diya.
