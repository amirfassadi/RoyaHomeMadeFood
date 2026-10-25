#!/usr/bin/env python3
"""Read-only disk/build inventory. No removal, credentials or application calls."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import subprocess

HOME_ROOT = Path("/home/amir")
SETUP_ROOT = HOME_ROOT / "roya-setup"
MIB = 1024 * 1024

def small_json(path, limit=1024 * 1024):
    try:
        if path.is_symlink() or path.stat().st_size > limit:
            return {}
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}

def main():
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo for a complete metadata-only inventory.")
    if HOME_ROOT.resolve() != HOME_ROOT or SETUP_ROOT.resolve() != SETUP_ROOT or not SETUP_ROOT.is_dir():
        raise SystemExit("STOP: unexpected Amir/Roya path.")
    result = subprocess.run(
        ["du", "-x", "-B1", "--max-depth=4", "--null", "--", str(HOME_ROOT)],
        capture_output=True, timeout=50, check=False)
    sizes = {}
    for record in result.stdout.split(bytes([0])):
        if record:
            size, name = record.split(b"\t", 1)
            sizes[Path(os.fsdecode(name))] = int(size)
    mib = lambda path: sizes.get(path, 0) // MIB
    def top(parent, count):
        rows = [(path, size) for path, size in sizes.items() if path.parent == parent]
        return [{"path": str(path), "allocatedMiB": size // MIB}
                for path, size in sorted(rows, key=lambda row: row[1], reverse=True)[:count]]
    groups = {}
    for path in sizes:
        if not path.is_relative_to(SETUP_ROOT):
            continue
        relative = path.relative_to(SETUP_ROOT)
        if (path.name in {"node_modules", ".next", ".roya-domain-stage"}
                and not any(part in {"node_modules", ".next", ".roya-domain-stage"}
                            for part in relative.parts[:-1])):
            groups.setdefault(path.parent, {})
    builds = []
    for project in sorted(groups, key=lambda path: sizes.get(path, 0), reverse=True):
        package = small_json(project / "package.json")
        descriptor = small_json(project / ".roya-origin.json")
        if not descriptor:
            descriptor = small_json(project / ".roya-domain-stage/.roya-origin.json")
        lock = project / "package-lock.json"
        lock_hash = None
        if lock.is_file() and not lock.is_symlink() and lock.stat().st_size <= 1024 * 1024:
            lock_hash = hashlib.sha256(lock.read_bytes()).hexdigest()
        builds.append({"path": str(project), "royaPackage": package.get("name") == "roya-food",
                       "totalMiB": mib(project), "nodeModulesMiB": mib(project / "node_modules"),
                       "nextMiB": mib(project / ".next"), "stageMiB": mib(project / ".roya-domain-stage"),
                       "release": descriptor.get("release"), "lockSha256": lock_hash})
    services = {}
    for unit in ("roya-preview.service", "roya-store.service"):
        state = subprocess.run(
            ["systemctl", "show", unit, "-p", "ActiveState", "-p", "MainPID",
             "-p", "WorkingDirectory", "--no-pager"],
            capture_output=True, text=True, timeout=5, check=False)
        fields = dict(line.split("=", 1) for line in state.stdout.splitlines() if "=" in line)
        try:
            fields["processCwd"] = str((Path("/proc") / fields["MainPID"] / "cwd").readlink())
        except (OSError, KeyError):
            fields["processCwd"] = None
        services[unit] = fields
    busy = []
    for process in Path("/proc").iterdir():
        if not process.name.isdigit():
            continue
        try:
            cwd = (process / "cwd").readlink()
            if cwd.is_relative_to(SETUP_ROOT):
                busy.append({"pid": int(process.name), "cwd": str(cwd)})
        except OSError:
            pass
    receipt = small_json(Path("/var/lib/roya/admin-backup-receipt.json"))
    marker = Path("/opt/roya/preview-current/.roya-release")
    statv = os.statvfs(HOME_ROOT)
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "readOnly": True,
              "duComplete": result.returncode == 0, "freeDiskMiB": statv.f_bavail * statv.f_frsize // MIB,
              "release": marker.read_text().strip(), "homeTotalMiB": mib(HOME_ROOT),
              "setupTotalMiB": mib(SETUP_ROOT), "homeTop": top(HOME_ROOT, 15),
              "setupTop": top(SETUP_ROOT, 25), "builds": builds, "services": services,
              "processesInRoyaSetup": busy,
              "backup": {key: receipt.get(key) for key in ("directory", "createdAt", "restoreVerified", "release")}}
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
