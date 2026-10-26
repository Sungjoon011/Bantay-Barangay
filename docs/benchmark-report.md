# Query Benchmark Report — Bantay-Barangay

**Environment:** Neon PostgreSQL (free tier), database `neondb`, branch `production`
**Test data:** 50,000 temporary residents (`database/06_benchmark_seed.sql`), removed afterwards (`09_benchmark_cleanup.sql`)
**Method:** `EXPLAIN (ANALYZE, BUFFERS)` from `database/08_benchmark_queries.sql`, run before and after `database/07_indexes.sql`

## Indexes added

| Index | Table(columns) | Why |
|---|---|---|
| Resident_lastName_firstName_idx | Resident(lastName, firstName) | name search and alphabetical directory |
| Resident_householdId_idx | Resident(householdId) | foreign key lookups / joins (PostgreSQL does not index FKs automatically) |
| DocumentRequest_residentId_idx, DocumentRequest_status_idx | DocumentRequest | a resident's requests; pending/processing queue |
| IncidentBlotter_complainantId_idx, IncidentBlotter_status_idx | IncidentBlotter | cases per complainant; open cases |
| BusinessPermit_residentId_idx | BusinessPermit | permits per resident |
| Appointment_residentId_date_idx | Appointment(residentId, scheduledDate) | resident's schedule |
| SystemAuditLog_timestamp_idx | SystemAuditLog(timestamp) | newest audit entries |
| BlotterParty_residentId_idx, ResidentProgram_residentId_idx | junction tables | reverse lookup by resident |

## Results (fill in with YOUR Neon numbers and paste the screenshots)

| Query | Plan BEFORE | Time BEFORE | Plan AFTER | Time AFTER | Improvement |
|---|---|---|---|---|---|
| Q1 `WHERE lastName = 'Surname123'` | Seq Scan | ___ ms | Bitmap Index Scan | ___ ms | ___x |
| Q2 `WHERE lastName = ... AND firstName = ...` | Seq Scan | ___ ms | Index Scan | ___ ms | ___x |
| Q3 `ORDER BY lastName, firstName LIMIT 20` | Seq Scan + Sort | ___ ms | Index Scan (no sort) | ___ ms | ___x |

(In a trial run on a local PostgreSQL 16 the same queries went from about 3.7 / 3.3 / 17.8 ms to about 0.29 / 0.014 / 0.05 ms. Your Neon numbers will differ; use your own.)

## Observations

- Before indexing, PostgreSQL reads all 50,000 rows (Seq Scan) for each lookup. After indexing, it jumps straight to the matching rows.
- The composite index (lastName, firstName) also removes the Sort step for the alphabetical page, because the index is already in that order.
- Trade-off: every index makes INSERT/UPDATE slightly slower and uses storage, so only columns used in WHERE / JOIN / ORDER BY are indexed.
