#!/usr/bin/env bash
# Read-only Roya DNS, IPv4 HTTPS, proxy and OUTPUT inspection.
set -uo pipefail
export LC_ALL=C
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

test "$(id -un)" = amir || exit 1
test -f /opt/roya/preview-current/.roya-release || exit 1

printf '\n--- PROXY VARIABLES (PRESENCE ONLY) ---\n'
for roya_proxy_key in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy NODE_USE_ENV_PROXY; do
  if printenv "$roya_proxy_key" >/dev/null; then
    printf '%s=set\n' "$roya_proxy_key"
  else
    printf '%s=unset\n' "$roya_proxy_key"
  fi
done

printf '\n--- PROXY SERVICE STATES ---\n'
systemctl show redsocks.service shadowsocks-libev.service \
  -p Id -p ActiveState -p SubState --no-pager || true

printf '\n--- IPV4 ROUTING ---\n'
ip -4 rule show
ip -4 route show default

for roya_probe_host in github.com cdn.jsdelivr.net registry.npmjs.org; do
  printf '\n--- SYSTEM DNS: %s ---\n' "$roya_probe_host"
  timeout 5 getent ahostsv4 "$roya_probe_host" |
    awk '!seen[$1]++ {print $1}' || true
done

for roya_probe_url in \
  'https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls' \
  'https://github.com/amirfassadi/RoyaHomeMadeFood.git/info/refs?service=git-upload-pack' \
  'https://registry.npmjs.org/'
do
  printf '\n--- DIRECT IPV4 HTTPS: %s ---\n' "$roya_probe_url"
  curl -4 --noproxy '*' --silent --show-error \
    --connect-timeout 4 --max-time 8 --output /dev/null \
    --write-out 'HTTP=%{http_code} IP=%{remote_ip} DNS=%{time_namelookup} TCP=%{time_connect} TLS=%{time_appconnect} TOTAL=%{time_total}\n' \
    "$roya_probe_url" || true
done

if command -v iptables >/dev/null 2>&1; then
  for roya_table in filter nat mangle; do
    printf '\n--- OUTPUT TABLE: %s ---\n' "$roya_table"
    sudo -n iptables -w 2 -t "$roya_table" -L OUTPUT -n -v --line-numbers || true
  done
fi
