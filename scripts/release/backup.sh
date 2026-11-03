#!/bin/sh
set -eu
# Bind libpq PGHOST/PGDATABASE/PGUSER/PGPASSFILE or PGSERVICE externally.
# Credentials never appear in command arguments or output.
: "${PGDATABASE:?Set PGDATABASE to the intended backup database}"
case "$PGDATABASE" in *[!a-zA-Z0-9_-]*|'') echo 'PGDATABASE must be a plain database name, not a URL' >&2; exit 1;; esac
[ -n "${PGHOST:-}${PGSERVICE:-}" ] || { echo 'Explicit PGHOST or PGSERVICE required' >&2; exit 1; }
[ "$#" -eq 1 ] || { echo 'Usage: backup.sh /secure/path/unique-name.dump' >&2; exit 1; }
umask 077
[ ! -e "$1" ] || { echo 'Refusing to overwrite backup' >&2; exit 1; }
backup_temp=$(mktemp "${1}.partial.XXXXXX")
trap 'rm -f "$backup_temp"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$backup_temp"
pg_restore --list "$backup_temp" >/dev/null
# noclobber also protects the destination if another backup finishes concurrently.
(set -C; cat "$backup_temp" > "$1")
echo 'Backup created and archive listing verified; restore rehearsal still required.'
