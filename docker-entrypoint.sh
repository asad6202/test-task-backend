#!/bin/sh
set -e

if [ "${SKIP_MIGRATE:-false}" != "true" ]; then
  echo "Running: prisma migrate deploy"
  npx prisma migrate deploy
fi

exec "$@"
