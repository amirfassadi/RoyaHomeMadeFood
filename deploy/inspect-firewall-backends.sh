#!/usr/bin/env bash
# Read-only firewall backend inspection on the Roya VPS.
set -euo pipefail
export LC_ALL=C
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
test "$(id -un)" = amir
test -f /opt/roya/preview-current/.roya-release

sudo -v </dev/tty

printf '\n--- LEGACY RULES ---\n'
if command -v iptables-legacy-save >/dev/null 2>&1; then
  sudo -n timeout 8 iptables-legacy-save || true
else
  printf 'iptables-legacy-save unavailable; legacy not inspected.\n'
fi

printf '\n--- NATIVE NFT RULES ---\n'
if command -v nft >/dev/null 2>&1; then
  sudo -n timeout 8 nft list ruleset || true
else
  printf 'nft unavailable; native nft rules not inspected.\n'
fi
