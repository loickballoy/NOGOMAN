#!/usr/bin/env sh
# Creates backend/.env from .env.example with freshly generated secrets.
# Usage: ./scripts/init-env.sh   (refuses to overwrite an existing .env)
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
chmod 600 .env
echo "Created .env with new secrets. Still to fill in: CLOUDFLARE_TUNNEL_TOKEN, CORS_ORIGINS, ADMIN_PHONES, SMS settings."
