Schema tests. Run against a throwaway Postgres 15+:

    createdb t
    psql -d t -f db-tests/stub.sql      # stands in for Supabase's auth schema + roles
    psql -d t -f schema.sql
    psql -d t -c "grant usage on schema public, app to authenticated; grant select on all tables in schema public to authenticated;"
    psql -d t -f db-tests/tests.sql     # prints PASS lines; FAIL raises

Covers: one running order per table, gap-free number series, business date and
fiscal year, bill total check, duplicate bill numbers, append-only audit log,
RLS tenant + outlet isolation, client writes blocked, and unindexed foreign keys.
