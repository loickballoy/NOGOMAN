#!/usr/bin/env sh
# Creates backend/.env from .env.example with freshly generated secrets.
#   ./scripts/init-env.sh           production-style settings (real SMS, no dev routes)
#   ./scripts/init-env.sh --local   local testing: login codes in the logs, API docs, simulated payments
# Refuses to overwrite an existing .env.
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists; edit it or delete it first." >&2
  exit 1
fi

# Hex only: the database password ends up inside a connection URL.
secret() { openssl rand -hex 32; }

sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret)|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$(secret)|" \
  -e "s|^OTP_SECRET=.*|OTP_SECRET=$(secret)|" \
  -e "s|^MOCK_WEBHOOK_SECRET=.*|MOCK_WEBHOOK_SECRET=$(secret)|" \
  .env.example > .env

if [ "${1:-}" = "--local" ]; then
  sed -i.bak \
    -e "s|^NODE_ENV=.*|NODE_ENV=development|" \
    -e "s|^SMS_PROVIDER=.*|SMS_PROVIDER=console|" \
    -e "s|^ENABLE_DOCS=.*|ENABLE_DOCS=true|" \
    -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=|" \
    .env
  rm -f .env.bak
  printf '\n# Local testing: settle simulated payments via /dev/payments/... (never in production)\nENABLE_DEV_ROUTES=true\n' >> .env
  chmod 600 .env
  echo "Created .env for local testing. Optionally set ADMIN_PHONES, then: docker compose up -d --build"
else
  chmod 600 .env
  echo "Created .env with new secrets. Still to fill in: CLOUDFLARE_TUNNEL_TOKEN, CORS_ORIGINS, ADMIN_PHONES, SMS settings."
fi
