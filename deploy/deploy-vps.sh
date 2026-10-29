#!/usr/bin/env bash
set -Eeuo pipefail
stage=initial-checks
trap 'printf "Deployment error: stage=%s line=%s exit=%s\\n" "$stage" "$LINENO" "$?" >&2' ERR
[[ $EUID == 0 && $# == 1 && $1 =~ ^[0-9a-f]{40}$ ]] || exit 2
sha=$1
exec 9>/run/lock/roya-deploy.lock
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }
export PATH=/opt/roya/tools/node/bin:/usr/sbin:/usr/bin:/sbin:/bin
base=/opt/roya
node=$base/tools/node/bin/node
[[ -x "$node" && -d "$base/deployments" && -d "$base/deploy-work" ]] || exit 1
[[ ! -L "$base/deployments" && ! -L "$base/deploy-work" ]] || exit 1
free_kb=$(df -Pk "$base" | awk 'END {print $4}')
(( free_kb >= 4194304 )) || { echo 'At least 4 GiB free disk space is required.'; exit 1; }
release=$base/deployments/$sha
[[ ! -e "$release" ]] || { echo 'This commit already exists; deploy a new commit.'; exit 1; }
old_store=$(readlink -e "$base/current")
old_preview=$(readlink -e "$base/preview-current")
[[ -d "$old_store" && -d "$old_preview" ]] || exit 1
work=$(mktemp -d "$base/deploy-work/run.XXXXXXXX")
chmod 755 "$base/deploy-work" "$work"
install -d -o roya-store -g roya-store -m 700 "$work/payload"
switched=0
committed=0
units_changed=0
unit="roya-migration-$$"
unit_count=0

point_to() {
  local target=$1 link=$2
  ln -s -- "$target" "$link.next-$$"
  mv -Tf -- "$link.next-$$" "$link"
}
cleanup() {
  local result=$?
  if (( result != 0 )); then printf 'Deployment stopped: stage=%s exit=%s\n' "$stage" "$result" >&2; fi
  trap - EXIT
  if (( result != 0 && switched == 1 && committed == 0 )); then
    echo 'Deployment failed; restoring previous application releases.'
    point_to "$old_store" "$base/current" || true
    point_to "$old_preview" "$base/preview-current" || true
  fi
  if (( result != 0 && units_changed == 1 && committed == 0 )); then
    cp -- "$work/roya-store.service.old" /etc/systemd/system/roya-store.service
    cp -- "$work/roya-preview.service.old" /etc/systemd/system/roya-preview.service
    systemctl daemon-reload || true
  fi
  if (( result != 0 && switched == 1 && committed == 0 )); then
    systemctl restart roya-store roya-preview || true
  fi
  systemctl stop "$unit.service" >/dev/null 2>&1 || true
  case "$work" in "$base"/deploy-work/run.*) rm -rf --one-file-system -- "$work" ;; esac
  if (( committed == 0 )); then
    case "$release" in "$base"/deployments/????????????????????????????????????????)
      rm -rf --one-file-system -- "$release" ;;
    esac
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stage=extract-archive
echo 'Extracting deployment archive.'
# Extract application-controlled files as the application user, never as root.
runuser -u roya-store -- tar -xzf - --no-same-owner -C "$work/payload"
stage=validate-archive
echo 'Validating extracted deployment archive.'
payload=$work/payload
[[ -d "$payload/runtime" && ! -L "$payload/runtime" ]] || { echo 'Missing runtime directory' >&2; exit 1; }
[[ -d "$payload/migrate" && ! -L "$payload/migrate" ]] || { echo 'Missing migration directory' >&2; exit 1; }
[[ -f "$payload/runtime/.next/standalone/server.js" ]] || { echo 'Missing runtime/.next/standalone/server.js' >&2; exit 1; }
[[ -f "$payload/migrate/prisma.config.ts" ]] || { echo 'Missing migrate/prisma.config.ts' >&2; exit 1; }

run_env() {
  local env_file=$1
  shift
  unit_count=$((unit_count + 1))
  unit="roya-migration-$$-$unit_count"
  systemd-run --quiet --wait --pipe --collect --unit="$unit" \
    --service-type=exec --uid=roya-store --gid=roya-store \
    -p "WorkingDirectory=$payload/migrate" \
    -p "EnvironmentFile=/etc/roya/database.env $env_file" \
    -p 'Environment=NODE_ENV=production' \
    -p 'NoNewPrivileges=yes' \
    "$node" "$@"
}

# Environment checks precede migration and switching. No secrets leave the VPS.
# Use the staged VPS configuration only for the new release. The running
# legacy services retain their original configuration for rollback.
backend_env=/etc/roya/backend.vps.env
preview_env=/etc/roya/preview.vps.env
[[ -f "$backend_env" && ! -L "$backend_env" ]] || { echo 'Missing backend.vps.env'; exit 1; }
[[ -f "$preview_env" && ! -L "$preview_env" ]] || { echo 'Missing preview.vps.env'; exit 1; }
stage=backend-preflight
echo 'Checking backend environment.'
run_env "$backend_env" --import tsx scripts/preflight.ts
stage=preview-preflight
echo 'Checking preview environment.'
run_env "$preview_env" --import tsx scripts/preflight.ts
stage=database-migration
run_env "$backend_env" node_modules/prisma/build/index.js migrate deploy
stage=database-seed
run_env "$backend_env" --import tsx prisma/seed.ts

stage=activate-release
mv -- "$payload/runtime" "$release"
chmod 755 "$release"
for service in roya-store roya-preview; do
  cp -- "/etc/systemd/system/$service.service" "$work/$service.service.old"
done
units_changed=1
for role in store preview; do
  if [[ $role == store ]]; then
    link=current; port=3310; env_file=backend.vps
  else
    link=preview-current; port=3311; env_file=preview.vps
  fi
  cat > "/etc/systemd/system/roya-$role.service" <<UNIT
[Unit]
Description=Roya $role Next.js application
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=roya-store
Group=roya-store
WorkingDirectory=/opt/roya/$link
EnvironmentFile=/etc/roya/database.env
EnvironmentFile=/etc/roya/$env_file.env
ExecStart=/usr/bin/env NODE_ENV=production HOSTNAME=127.0.0.1 PORT=$port /opt/roya/tools/node/bin/node /opt/roya/$link/.next/standalone/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/opt/roya/$link/.next
[Install]
WantedBy=multi-user.target
UNIT
done
switched=1
point_to "$release" "$base/current"
point_to "$release" "$base/preview-current"
systemctl daemon-reload
systemctl restart roya-store roya-preview
stage=health-checks
healthy=0
for attempt in {1..30}; do
  if systemctl is-active --quiet roya-store roya-preview \
    && curl --fail --silent --max-time 3 http://127.0.0.1:3310/api/health/ >/dev/null \
    && curl --fail --silent --max-time 3 http://127.0.0.1:3311/api/health/ >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done
(( healthy == 1 )) || { echo 'Health checks failed.'; exit 1; }
touch "$release/.roya-deployed"
systemctl enable roya-store roya-preview
committed=1

# Keep the active deployment plus the two most recently deployed predecessors.
kept=0
while IFS= read -r name; do
  [[ $name =~ ^[0-9a-f]{40}$ ]] || continue
  candidate=$base/deployments/$name
  [[ -d "$candidate" && ! -L "$candidate" && -f "$candidate/.roya-deployed" ]] || continue
  [[ "$candidate" == "$(readlink -e "$base/current")" ]] && continue
  [[ "$candidate" == "$(readlink -e "$base/preview-current")" ]] && continue
  kept=$((kept + 1))
  if (( kept > 2 )); then
    rm -rf --one-file-system -- "$candidate"
  fi
done < <(find "$base/deployments" -mindepth 2 -maxdepth 2 -type f \
  -name .roya-deployed -printf '%T@ %h\n' | sort -rn | sed 's|.*/||')
printf 'Deployment healthy: %s\n' "$sha"
echo 'Migration workspace removed on exit. Old legacy releases require one-time cleanup.'
