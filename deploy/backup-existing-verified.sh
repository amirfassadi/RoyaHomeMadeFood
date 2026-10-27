#!/usr/bin/env bash
# Use only an existing, content-verified Roya backup helper; no download.
set -euo pipefail
set +x
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
test "$(id -un)" = amir
sudo -v </dev/tty
sudo -n python3 <<'PY'
from pathlib import Path
import hashlib

root = Path("/home/amir/roya-setup")
marker = Path("/opt/roya/preview-current/.roya-release")
if marker.read_text().strip() != "321f8929648c9fcf2bdcfda3e270352b0b9d2174":
    raise SystemExit("STOP: installed release changed; backup was not started.")
if not root.is_dir() or root.resolve() != root:
    raise SystemExit("STOP: unexpected Roya setup path.")
expected = "2244bd2a7eb8f195d55e45c6770a583bf64a8558"
paths = set(root.glob("*/source/deploy/backup-before-admin.py"))
paths.update(root.glob("*/deploy/backup-before-admin.py"))
for path in sorted(paths):
    try:
        if not path.is_file() or path.resolve() != path or path.stat().st_size > 32000:
            continue
        source = path.read_bytes()
    except OSError:
        continue
    header = b"blob " + str(len(source)).encode("ascii") + bytes([0])
    if hashlib.sha1(header + source).hexdigest() != expected:
        continue
    print("Existing pinned backup source verified:", path, flush=True)
    exec(compile(source, str(path), "exec"),
         {"__name__": "__main__", "__file__": str(path)})
    raise SystemExit(0)
raise SystemExit("STOP: matching backup helper not found; nothing executed.")
PY
