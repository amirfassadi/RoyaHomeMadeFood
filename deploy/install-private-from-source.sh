#!/usr/bin/env bash
# Run from an extracted, checksum-verified immutable GitHub source archive.
set -euo pipefail
set +x
umask 077
[ "$(id -un)" = amir ] && [ "$(id -u)" -ne 0 ] || {
  echo 'Run as amir, without sudo before bash.'
  exit 1
}
source_root="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
payload_root="$(python3 - "$source_root" <<'PY_PREPARE'
from pathlib import Path,PurePosixPath
import hashlib,json,shutil,sys,tempfile
root=Path(sys.argv[1]).resolve()
m=json.loads((root/'deploy/private-preview-manifest.json').read_text())
if m.get('format')!=2 or set(m.get('bases',{}))!={'3b7a85cf8bd17fc7e5bbc128971d4517f15f8f18'}:
    raise SystemExit('STOP: unexpected private preview manifest.')
if hashlib.sha1(json.dumps(m['target_files'],sort_keys=True).encode()).hexdigest()!=m['release_id']:
    raise SystemExit('STOP: source release hash mismatch.')
for name,digest in m['target_files'].items():
    relative=PurePosixPath(name);p=root/name
    if (relative.is_absolute() or '..' in relative.parts or p.is_symlink()
            or not p.resolve().is_relative_to(root) or not p.is_file()
            or hashlib.sha256(p.read_bytes()).hexdigest()!=digest):
        raise SystemExit('STOP: GitHub source verification failed: '+name)
if not set(m['overlay_files']).issubset(m['target_files']):
    raise SystemExit('STOP: unexpected overlay file.')
base=Path.home()/'roya-setup';base.mkdir(mode=0o700,exist_ok=True)
payload=Path(tempfile.mkdtemp(prefix='github-package.',dir=base))
for name in m['overlay_files']:
    p=payload/'overlay'/name;p.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(root/name,p);p.chmod(0o600)
(payload/'manifest.json').write_text(json.dumps(m,sort_keys=True))
shutil.copyfile(root/'deploy/update-private-preview.sh',payload/'install.sh')
(payload/'install.sh').chmod(0o600)
print(payload)
PY_PREPARE
)"
printf 'GitHub source verified; preparing private preview update.\n'
sudo -v
sudo -n python3 "$source_root/deploy/backup-before-admin.py"
exec bash "$payload_root/install.sh"
