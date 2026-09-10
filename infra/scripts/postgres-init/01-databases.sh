#!/bin/sh
# Creates the two databases MOJ needs. Runs once, on first boot of the volume.
#
#   $CONVEX_DATABASE  backing store for the self-hosted Convex backend. Its name
#                     is forced by the backend: INSTANCE_NAME with "-" replaced
#                     by "_", so moj-dev -> moj_dev.
#   $AUTH_DATABASE    Better Auth tables, managed by Drizzle.
set -eu

for db in "${CONVEX_DATABASE:-moj_dev}" "${AUTH_DATABASE:-moj_auth}"; do
  echo "creating database ${db}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
    SELECT 'CREATE DATABASE "${db}"'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\gexec
SQL
done
