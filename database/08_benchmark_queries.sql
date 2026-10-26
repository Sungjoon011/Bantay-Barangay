-- 08_benchmark_queries.sql : run once BEFORE 07_indexes.sql and once AFTER. Screenshot both results.
-- Look for "Seq Scan" (before) vs "Index Scan"/"Bitmap Index Scan" (after) and the "Execution Time".

-- Q1: find residents by surname
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "Resident" WHERE "lastName" = 'Surname123';

-- Q2: find one resident by full name
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "Resident" WHERE "lastName" = 'Surname123' AND "firstName" = 'Bench123';

-- Q3: alphabetical directory page
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "Resident" ORDER BY "lastName", "firstName" LIMIT 20;
