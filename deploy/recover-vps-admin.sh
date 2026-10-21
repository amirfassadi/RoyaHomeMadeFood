#!/usr/bin/env bash
# Operator-authorized recovery on the existing private preview. No reinstall.
set -euo pipefail
set +x
umask 077
export PATH=/opt/roya/tools/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

if [ "$(id -u)" -eq 0 ] || [ ! -t 0 ] || [ ! -t 1 ]; then
  echo 'Run this script as amir in the interactive VPS SSH terminal.'
  exit 1
fi
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["release_id"])' "$source_root/deploy/private-preview-manifest.json")"
candidate="${1:?Pass the existing private preview source directory}"
sudo -v
current="$(sudo -n cat /opt/roya/preview-current/.roya-release)"
[ "$current" = "$target" ] || {
  echo 'STOP: the installed release differs; no password changed.'
  exit 1
}
sudo -n systemctl is-active --quiet roya-preview.service

# Use the existing installed dependencies only after checking all application sources.
python3 - "$source_root" "$candidate" <<'VERIFY_SOURCE'
import hashlib, json, sys
from pathlib import Path
root, candidate = map(Path, sys.argv[1:])
manifest = json.loads((root / 'deploy/private-preview-manifest.json').read_text())
if len(manifest['release_id']) != 40:
    raise SystemExit('STOP: unexpected recovery source release.')
if not candidate.is_dir() or not (candidate / 'node_modules/tsx').is_dir():
    raise SystemExit('STOP: existing application dependencies not found.')
for name, expected in manifest['target_files'].items():
    # Next.js regenerates this declaration at build time; it contains no runtime code.
    if name == 'next-env.d.ts':
        continue
    path = candidate / name
    if path.is_symlink() or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit('STOP: existing application source differs: ' + name)
print('Existing recovery code and application sources verified. No build required.')
VERIFY_SOURCE

sudo -n python3 "$source_root/deploy/backup-before-admin.py"
exec 9<>"$HOME/roya-setup/deploy.lock"
flock -n 9 || { echo 'STOP: another Roya operation is running.'; exit 1; }

# Bind authorization to the freshly verified backup and the exact runtime configuration.
node --input-type=module - "$target" <<'VERIFY_BACKUP'
import {execFileSync} from 'node:child_process';
const read=(...args)=>execFileSync('sudo',['-n',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const r=JSON.parse(read('cat','/var/lib/roya/admin-backup-receipt.json'));
const release=read('cat','/opt/roya/preview-current/.roya-release');
const age=Date.now()-Date.parse(r.createdAt);
if(r.database!=='roya_store'||r.restoreVerified!==true||r.release!==release||release!==process.argv[2]||!Number.isFinite(age)||age< -60000||age>2*3600000||r.previewEnvSha256!==read('sha256sum','/etc/roya/preview.env').split(/\s/)[0]||r.databaseEnvSha256!==read('sha256sum','/etc/roya/database.env').split(/\s/)[0])throw new Error('STOP: backup or configuration no longer matches; no password changed.');
console.log('Fresh verified backup matches this private preview.');
VERIFY_BACKUP

unset DATABASE_URL DIRECT_URL
credentials="$(sudo -n cat /etc/roya/database.env)"
while IFS='=' read -r key value; do
  case "$key" in DATABASE_URL|DIRECT_URL) export "$key=$value" ;; esac
done <<< "$credentials"
unset credentials key value
trap 'unset DATABASE_URL DIRECT_URL' EXIT
node --input-type=module <<'VERIFY_DATABASE'
for(const name of ['DATABASE_URL','DIRECT_URL']){
 let u;try{u=new URL(process.env[name]||'');}catch{throw new Error('STOP: invalid database configuration; no password changed.');}
 if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='5432'||u.pathname!=='/roya_store'||u.username!=='roya_app'||!u.password)throw new Error('STOP: unexpected database target; no password changed.');
}
console.log('Local Roya database target verified.');
VERIFY_DATABASE

cd -- "$candidate"
echo 'Recover the existing administrator: mobile, RESET, then enter the new password twice.'
node --import tsx scripts/recover-admin.ts </dev/tty
unset DATABASE_URL DIRECT_URL
echo 'Now enter the same administrator mobile and new password for the product test.'
echo 'This creates only an inactive test product and archives it at the end.'
node "$source_root/deploy/test-vps-admin.mjs" </dev/tty
echo 'ADMIN RECOVERY AND PRODUCT TEST COMPLETE.'
