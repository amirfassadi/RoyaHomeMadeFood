#!/usr/bin/env bash
set -euo pipefail
set +x
export DATABASE_URL="${ROYA_INTEGRATION_DATABASE_URL:?Isolated integration database required}"
export NEXTAUTH_URL=http://127.0.0.1:4313
export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4313
export NEXTAUTH_SECRET=test-only-http-integration-session-secret
export ROYA_DEPLOYMENT_ROLE=standalone ROYA_DEMO_CATALOG=1
export ROYA_LIVE_PAYMENTS=0 ROYA_ACCEPT_ORDERS=0 ROYA_SEND_SMS=0 ROYA_INDEXABLE=0
export ROYA_INTERNATIONAL_ENABLED=0 CUSTOMER_ACCOUNTS_ENABLED=0 ROYA_TRUST_GEO_HEADER=0
unset SITES_STATIC_PREVIEW ROYA_BACKEND_URL
node --input-type=module <<'VERIFY'
const u=new URL(process.env.DATABASE_URL);
if(!['roya_test','roya_integration_test'].includes(u.pathname.slice(1)))throw new Error('Refusing a storefront database.');
VERIFY
mkdir -p .next/standalone/.next
cp -a public .next/standalone/
cp -a .next/static .next/standalone/.next/
http_log="$(mktemp)"
HOSTNAME=127.0.0.1 PORT=4313 node .next/standalone/server.js >"$http_log" 2>&1 &
http_pid=$!
trap 'kill -TERM "$http_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 40); do
  if curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:4313/api/health/ >/dev/null; then
    node --conditions=react-server --import tsx scripts/test-admin-http.ts
    exit 0
  fi
  sleep 0.5
done
echo 'Integration HTTP server did not become ready.'
tail -n 30 "$http_log"
exit 1
