#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
export PATH=/opt/roya/tools/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[ "$(id -un)" = amir ] && [ "$(id -u)" -ne 0 ] || { echo 'Run as amir, without sudo before bash.'; exit 1; }
offline=0
if [ "$#" -gt 0 ]; then
  [ "$#" -eq 1 ] && [ "$1" = --offline ] || { echo 'Usage: upgrade-private-domain.sh [--offline]'; exit 1; }
  offline=1
fi
source_root="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
mkdir -p "$HOME/roya-setup"
sudo -v </dev/tty
sudo -n python3 "$source_root/deploy/connect-private-domain.py" --upgrade --preflight
exec 9>"$HOME/roya-setup/deploy.lock"
flock -n 9 || { echo 'STOP: another Roya deployment is running.'; exit 1; }
candidate="$(mktemp -d "$HOME/roya-setup/domain-source.XXXXXX")"
printf 'HTTPS candidate source: %s\n' "$candidate"
python3 - "$source_root" "$candidate" <<'PREPARE'
from pathlib import Path, PurePosixPath
import hashlib,json,shutil,sys
root,destination=map(Path,sys.argv[1:])
m=json.loads((root/'deploy/private-domain-upgrade-manifest.json').read_text())
if m['format']!=1 or m['baseRelease']!='321f8929648c9fcf2bdcfda3e270352b0b9d2174' or m['sourceRelease']!='daaad0f432a44df749a00fb1f0fc09ec90307c03' or m['origin']!='https://royahealthyfood.ir' or hashlib.sha1(json.dumps(m['files'],sort_keys=True).encode()).hexdigest()!=m['sourceRelease']:
    raise SystemExit('STOP: unexpected private source manifest.')
for name,digest in m['files'].items():
    path=PurePosixPath(name);p=root/name
    if path.is_absolute() or '..' in path.parts or p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(root.resolve()) or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
        raise SystemExit('STOP: private application source differs: '+name)
    target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
origin='https://royahealthyfood.ir'
release=hashlib.sha1(('roya-private-domain-v1\n'+m['sourceRelease']+'\n'+origin).encode()).hexdigest()
(destination/'.roya-origin.json').write_text(json.dumps({'release':release,'sourceRelease':m['sourceRelease'],'origin':origin},sort_keys=True))
print('Verified finalization upgrade source; running application and private gate are unchanged.')
PREPARE
cd "$candidate"
unset DATABASE_URL DIRECT_URL NEXTAUTH_SECRET NEXTAUTH_URL_INTERNAL ROYA_BACKEND_URL SITES_STATIC_PREVIEW
if [ "$offline" -eq 1 ]; then
  python3 "$source_root/deploy/offline-build-inputs.py" verify "$source_root" "$candidate"
  npm cache add "$source_root/deploy/vendor/fast-uri-3.1.9.tgz" \
    --offline --ignore-scripts --cache "$HOME/.npm" --no-audit --no-fund
  # Do not run dependency lifecycle hooks that could download external binaries.
  npm ci --offline --ignore-scripts --include=dev --cache "$HOME/.npm" --no-audit --no-fund
  python3 "$source_root/deploy/offline-build-inputs.py" restore-engine "$source_root" "$candidate"
  export PRISMA_SCHEMA_ENGINE_BINARY="$candidate/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
  export PRISMA_ENGINES_MIRROR=http://127.0.0.1:9
  node "$source_root/deploy/check-offline-native.mjs"
else
  npm ci --include=dev --no-audit --no-fund
fi
env NEXT_TELEMETRY_DISABLED=1 ROYA_DEPLOYMENT_ROLE=standalone ROYA_DEMO_CATALOG=1 ROYA_PRIVATE_DB_CATALOG=1 \
  ROYA_INDEXABLE=0 ROYA_LIVE_PAYMENTS=0 ROYA_ACCEPT_ORDERS=0 ROYA_SEND_SMS=0 \
  NEXTAUTH_URL=https://royahealthyfood.ir NEXT_PUBLIC_SITE_URL=https://royahealthyfood.ir \
  NODE_OPTIONS=--max-old-space-size=1536 npm run build:app
stage="$candidate/.roya-domain-stage"
mkdir "$stage"
cp -a .next/standalone/. "$stage/"
cp -a public "$stage/public"
mkdir -p "$stage/.next"
cp -a .next/static "$stage/.next/static"
cp .roya-origin.json "$stage/.roya-origin.json"
printf 'Prepared standalone stage: %s\n' "$stage"
flock -u 9
python3 "$source_root/deploy/compact-domain-build.py" "$candidate"
sudo -v </dev/tty
# Activation obtains its own lock and repeats the full preflight after the build.
sudo -n python3 "$source_root/deploy/connect-private-domain.py" --upgrade --install "$stage" </dev/tty
printf 'Activated candidate source: %s\n' "$candidate"
