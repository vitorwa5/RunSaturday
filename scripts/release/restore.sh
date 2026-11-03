#!/bin/sh
set -eu
: "${PGDATABASE:?Set PGDATABASE to an EMPTY isolated recovery database}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM to the exact isolated database name}"
[ "$RESTORE_CONFIRM" = "$PGDATABASE" ] || { echo 'Recovery target confirmation mismatch' >&2; exit 1; }
case "$PGDATABASE" in *[!a-zA-Z0-9_-]*|'') echo 'PGDATABASE must be a plain database name, not a URL' >&2; exit 1;; esac
[ -n "${PGHOST:-}${PGSERVICE:-}" ] || { echo 'Explicit PGHOST or PGSERVICE required' >&2; exit 1; }
[ "$#" -eq 1 ] || { echo 'Usage: restore.sh /secure/path/backup.dump' >&2; exit 1; }
# Refuse any user tables, including _prisma_migrations. No --clean or --create.
recovery_tables=$(psql -X -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")
[ "$recovery_tables" = 0 ] || { echo 'Recovery target is not empty' >&2; exit 1; }
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$PGDATABASE" "$1"
echo 'Restore completed. Keep isolated; validate migrations, counts and ownership before promotion.'
