#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
export PATH=/opt/roya/tools/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[ "$(id -u)" -ne 0 ] && [ -t 0 ] && [ -t 1 ] || { echo 'Run as amir in the interactive VPS SSH terminal.'; exit 1; }
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
target="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["release_id"])' "$source_root/deploy/private-preview-manifest.json")"
candidate="${1:?Pass the installed preview source directory}"
sudo -v
[ "$(sudo -n cat /opt/roya/preview-current/.roya-release)" = "$target" ] || { echo 'STOP: private preview release differs.'; exit 1; }
python3 - "$source_root" "$candidate" <<'VERIFY'
import hashlib,json,sys
from pathlib import Path
root,candidate=map(Path,sys.argv[1:])
m=json.loads((root/'deploy/private-preview-manifest.json').read_text())
if len(m['release_id'])!=40 or not (candidate/'node_modules/tsx').is_dir():
    raise SystemExit('STOP: unexpected source or missing installed dependencies.')
for name,digest in m['target_files'].items():
    if name=='next-env.d.ts': continue
    p=candidate/name
    if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
        raise SystemExit('STOP: installed source differs: '+name)
p=root/'node_modules'
if p.exists() or p.is_symlink():
    if p.resolve()!=(candidate/'node_modules').resolve():
        raise SystemExit('STOP: unexpected test dependency directory.')
else: p.symlink_to((candidate/'node_modules').resolve(),target_is_directory=True)
print('Pricing test sources verified; existing application unchanged.')
VERIFY
sudo -n python3 "$source_root/deploy/backup-before-admin.py"
exec 9<>"$HOME/roya-setup/deploy.lock"
flock -n 9 || { echo 'STOP: another Roya operation is running.'; exit 1; }
cd -- "$source_root"
node --import tsx deploy/test-vps-pricing.ts </dev/tty
echo 'PRIVATE PRICING TEST COMPLETE.'
