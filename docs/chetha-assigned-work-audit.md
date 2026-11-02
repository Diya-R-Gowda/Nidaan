# Chetha's Assigned Work - Repository Audit

Audit date: 2026-10-31  
Repository: `Diya-R-Gowda/Nidaan`  
Audited revision: `a427c4f` (`Add project README and requirements document`)  
Audit branch: `feature/chetha-dbms-deliverables`

## Scope and evidence boundary

This audit reflects the complete tracked tree on the repository's `main` branch at the revision above. The checkout contains only `README.md` and `DBMS Level 3 Project Requirements draft.pdf`. The README describes a proposed project architecture and files, but the files it names are not present. No claims below treat planned functionality as implemented.

The separate `nidaan_report_work_division.md` and any completed project report were not in the repository. This audit therefore cannot establish the exact content or status of the assigned report sections beyond the task description supplied by Chetha.

## Git state

- Initial checkout: `main`, clean, at `a427c4f`, tracking `origin/main`.
- Remote branches visible after clone: `origin/main` only.
- `feature/chetha-dbms-deliverables` did not exist locally or remotely at audit time; this local branch was created from `main` without modifying `main`.
- The connected GitHub account has pull/read permission and no push permission. No remote changes were made.

## Assigned work status

| Assignment | Verified repository state | Status |
|---|---|---|
| §5(c): stored functions, views, DML | No SQL files or database schema exist in the checkout. README names expected SQL setup files but none are tracked. | BLOCKED |
| §6: NoSQL/vector commands | README describes pgvector, `vector(384)`, cosine similarity, HNSW and `Xenova/all-MiniLM-L6-v2`, but no extension setup, vector DDL, embedding insertion, search query, or query plan comparison exists. These are specification claims, not verified implementation. | BLOCKED |
| §7: Next.js project tree | README §20 lists a conceptual tree. No `package.json`, `app/`, `db/`, `lib/`, scripts or tests are present. | BLOCKED |
| §8 Part 2: Receptionist and Pharmacovigilance screens | The screens and features are described in the README, but there is no application source or API route to inspect or launch. There are no screenshots in the tracked tree. | BLOCKED |
| §9: Evaluation rubrics and completion status | README §23 maps requirements to planned files and sections; several referenced files do not exist. No evidence-based implementation rubric or test-result log exists. | PARTIAL |
| Final proofreading | The README is the only report-like document present. Its project tree and coverage map present planned artifacts as though they are implemented. A complete report and work-division document are absent. | PARTIAL |

## Requirements coverage rubric

Statuses apply to verified repository evidence, not to the intended design. `PARTIAL` means some documentation exists but the required implementation or evidence is missing. `BLOCKED` means verification requires the missing project source or environment. `NOT TESTED` means the available files do not support a meaningful test.

| # | Requirement | Expected implementation | Actual implementation in audited revision | Evidence | Status |
|---:|---|---|---|---|---|
| 1 | Unique title, real problem, beyond CRUD | Distinct project addressing a real problem with advanced behavior | Nidaan is described as clinic consultation and adverse-event signal detection; implementation cannot be inspected | `README.md` §§1-5 | PARTIAL |
| 2 | Two-member team and contribution | Two members, each contributing to database and application | Contribution section has `(name)` placeholders; no application or commit attribution evidence beyond the initial documentation commit | `README.md` §22; Git history | PARTIAL |
| 3 | At least two database paradigms | SQL plus an appropriate NoSQL or vector database | PostgreSQL and pgvector are described, but no database implementation is present | `README.md` §§8-9, 13; tracked tree | PARTIAL |
| 4 | ER diagram and relational schema | Entities, attributes, keys, relationships and constraints documented | README describes entities and relationships; referenced ER image and implementation schema are absent | `README.md` §§10-12, §23; tracked tree | PARTIAL |
| 5 | SQL implementation / DDL | Executed CREATE, ALTER, DROP, keys, constraints, indexes and appropriate views | No `.sql` files exist | Tracked tree; README §19 lists absent `db/` files | FAIL |
| 6 | Meaningful DML | INSERT, UPDATE, DELETE, SELECT and appropriate joins/aggregates/subqueries | Queries are described in the documentation but no executable query files or database evidence exist | `README.md` §§15, 19; tracked tree | FAIL |
| 7 | Four advanced database concepts | Four or more implemented advanced concepts | README proposes transactions, procedures, triggers, indexing, full-text and vector search; none can be verified in code | `README.md` §§14, 21; tracked tree | FAIL |
| 8 | Vector data model and semantic search | Embedding model, storage, metric and retrieval strategy documented and implemented | Design description specifies a 384-dimensional embedding and cosine distance, but no code, SQL or executed retrieval evidence is present | `README.md` §§8-9, 13; tracked tree | PARTIAL |
| 9 | Functional Next.js web interface | Working Next.js forms, tables, searches or dashboards | No Next.js source or `package.json` exists | Tracked tree | FAIL |
| 10 | Database-application integration and secrets | API/backend integration and environment-based configuration | README describes a planned route-handler architecture and `.env.example`; neither routes nor env example are tracked | `README.md` §§8, 17, 19; tracked tree | PARTIAL |
| 11 | Authentication and roles | Authentication and at least two relevant roles | Four roles and restrictions are described; no authentication or authorization implementation exists | `README.md` §§6, 17; tracked tree | PARTIAL |
| 12 | Database-level validation and integrity | Constraints and consistency checks enforced in the database | README gives example constraints, but no schema exists to verify or execute them | `README.md` §18; tracked tree | PARTIAL |
| 13 | Security | No plaintext passwords or exposed credentials | Security practices are described only; source/configuration needed for verification is absent | `README.md` §17; tracked tree | PARTIAL |
| 14 | Project documentation | Problem, design, SQL/vector implementation, queries, architecture, screenshots, tests, conclusion | README covers design narrative; implementation evidence, screenshots and results are missing | `README.md`; tracked tree | PARTIAL |
| 15 | Git/GitHub and suitable README | Source in GitHub, individual contributions, setup instructions | Repository and setup-oriented README exist; no implementation source or individual contribution history is evidenced | Git history; `README.md` §§19, 22 | PARTIAL |
| 16 | Evaluation/demo coverage | Demonstrate design, database, queries, UI, integration, tests and contributions | README outlines demo/test expectations; there is no running application or recorded test evidence | `README.md` §§16, 21 | PARTIAL |
| 17 | Originality | Original design and implementation | Originality cannot be assessed from a README and requirements document alone | No implementation to compare | NOT TESTED |
| 18 | Level 3 expectation | Functional app clearly connected to advanced database implementation and justified data paradigms | The conceptual justification is documented; implementation and integration are absent | `README.md` §§5, 9; tracked tree | PARTIAL |

## Vector implementation checklist

The following required evidence is absent. The README's stated model is `Xenova/all-MiniLM-L6-v2`, vector dimension `384`, and cosine distance; these need confirmation against the eventual code and actual database before being presented as verified.

- `CREATE EXTENSION vector` command and successful execution evidence.
- Actual table and column definition, including vector dimension.
- Embedding-generation code and a valid insert/update example.
- Parameterized cosine-distance nearest-neighbor query.
- HNSW index DDL and confirmation the index exists.
- Full-text query using the actual text-search column/index.
- Comparable `EXPLAIN ANALYZE` plans from the same data and query with/without the vector index. No timings or results are available to report.

## Application/screens evidence

| Screen or feature | Source/API evidence | Functional status |
|---|---|---|
| Receptionist patient registration | None found | BLOCKED |
| Appointment booking and calendar | None found | BLOCKED |
| In-person/online booking and conflict handling | None found | BLOCKED |
| Reminders | None found | BLOCKED |
| Invoice preview and printing | None found | BLOCKED |
| Pharmacovigilance signal dashboard and report details | None found | BLOCKED |
| Ten nearest neighbors and similarity scores | None found | BLOCKED |
| Full-text/vector comparison | None found | BLOCKED |

No screenshot was created. Once the full app is available and runs, launch it using the repository's verified setup instructions, navigate to each screen with a functioning account, and capture the live browser window with the OS screenshot tool. Save the untouched captures into the report's designated screenshots folder and caption each with the route, role, and capture date. Do not use mockups or generated UI as evidence.

## Verified project tree

```text
Nidaan/
├── DBMS Level 3 Project Requirements draft.pdf
├── README.md
└── docs/
    └── chetha-assigned-work-audit.md  (this audit; added on the feature branch)
```

The README's §20 tree is aspirational for this audited revision and should be replaced with the real tree once implementation files are committed.

## Commands run and actual outcomes

| Command/action | Outcome |
|---|---|
| `git clone https://github.com/Diya-R-Gowda/Nidaan.git Nidaan` | Succeeded; cloned default branch. |
| `git status --short --branch` | At initial audit: `## main...origin/main`; clean. |
| `git branch --list` and `git branch -r` | Only `main` and `origin/main` existed; target feature branch absent. |
| `git log -1 --oneline --decorate` | `a427c4f (HEAD -> main, origin/main, origin/HEAD) Add project README and requirements document`. |
| `git ls-tree -r --name-only HEAD` | Exactly `DBMS Level 3 Project Requirements draft.pdf` and `README.md`. |
| `rg --files` for README, work-division document, package manifest, SQL, report and `AGENTS.md` | Only README was found; no work-division file, app manifest, SQL, report or agent instructions. |
| `pdftotext -layout ... -` | Could not run: `pdftotext` is not available on PATH. |
| System `python -c ...` | Could not run: Windows Store `python.exe` alias could not start. |
| Bundled Python + `pdfplumber` extraction | Succeeded for all 4 pages. Read the official requirement text; see rubric above. |
| `git switch -c feature/chetha-dbms-deliverables` | Succeeded; created local feature branch from clean `main`. |
| `git diff --check` after adding this audit | Succeeded with no whitespace errors. |
| `git status --short --branch` after adding this audit | `## feature/chetha-dbms-deliverables`; only the new untracked `docs/` audit is present. |
| `git branch --show-current` | `feature/chetha-dbms-deliverables`. |

No database, application, or automated tests were run because none is present. No test is marked as passed. No execution output, benchmark, screenshot, or score has been fabricated.

## Required next inputs and implementation order

1. Restore or provide the complete repository revision containing the database schema, Next.js app, scripts and tests, plus `nidaan_report_work_division.md` and the actual report.
2. Re-audit Git status and existing implementation before editing; preserve other contributors' changes.
3. Implement only missing stored functions, views and DML against the real schema; execute read-only demonstrations where safe.
4. Verify actual pgvector model, dimension, insertion/search SQL and measured query plans without inventing results.
5. Generate the project tree from tracked files; inspect and run the actual app before describing screens or taking screenshots.
6. Update the requirement rubric and proofread only Chetha's assigned report sections, flagging cross-section issues separately.

The GitHub integration reports read/pull permission only. To publish this branch later, the repository owner must grant the account write/push access. This audit did not push, commit, merge or change the remote.
