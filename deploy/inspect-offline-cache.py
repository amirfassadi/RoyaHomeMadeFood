#!/usr/bin/env python3
"""Read-only inventory of public npm tarballs and existing Prisma engines.

No network, package scripts, extraction, installation, or configuration writes.
This inventory is a prerequisite, not proof of a completed offline build.
"""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import time

LOCK_SHA256 = 'e816e899d7c093baa40cddd5da216e1a1742977a5496fc8623c15a3b97febd76'
ENGINE_SHA256 = '29557c21d47da6f1695ec1a747cb6c607dade5e44e8b3e4fa687bd4dc226956d'
ENGINE_VERSION = '0edf323efd1d98336f3f0a68684b56f689b900d3'
ENGINE_FILE = 'schema-engine-debian-openssl-3.0.x'


def allows(value, restrictions):
    if not restrictions:
        return True
    positives = [item for item in restrictions if not item.startswith('!')]
    return '!' + value not in restrictions and (not positives or value in positives)


def read_lock(archive):
    with tarfile.open(archive, 'r:gz') as source:
        files = [item for item in source.getmembers()
                 if re.fullmatch(r'RoyaHomeMadeFood-[0-9a-f]{40}/package-lock.json', item.name)]
        if len(files) != 1 or not files[0].isfile() or files[0].size > 1000000:
            raise RuntimeError('Unexpected source archive; nothing executed.')
        data = source.extractfile(files[0]).read()
    if hashlib.sha256(data).hexdigest() != LOCK_SHA256:
        raise RuntimeError('Pinned package-lock mismatch; nothing executed.')
    return json.loads(data)


def inventory(lock, cache, home):
    machine = platform.machine().lower()
    cpu = {'x86_64': 'x64', 'amd64': 'x64', 'aarch64': 'arm64'}.get(machine, machine)
    operating_system = platform.system().lower()
    libc = platform.libc_ver()[0] or 'unknown'
    checked, missing, corrupt, skipped = [], [], [], 0
    deadline = time.monotonic() + 35
    for name, item in lock['packages'].items():
        if not name or 'integrity' not in item:
            continue
        if not (allows(operating_system, item.get('os')) and allows(cpu, item.get('cpu'))
                and allows(libc, item.get('libc'))):
            skipped += 1
            continue
        if time.monotonic() > deadline:
            raise RuntimeError('Cache inventory time limit reached; no installation attempted.')
        integrity = item['integrity']
        if not integrity.startswith('sha512-') or ' ' in integrity:
            raise RuntimeError('Unsupported integrity format; nothing executed.')
        digest = base64.b64decode(integrity[7:], validate=True).hex()
        if len(digest) != 128:
            raise RuntimeError('Unexpected integrity length; nothing executed.')
        path = cache / '_cacache/content-v2/sha512' / digest[:2] / digest[2:4] / digest[4:]
        label = name + '@' + item['version']
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(cache.resolve()):
            missing.append(label)
        elif path.stat().st_size > 128 * 1024 * 1024:
            corrupt.append(label + ' [verification size limit]')
        else:
            with path.open('rb') as stream:
                matches = hashlib.file_digest(stream, 'sha512').hexdigest() == digest
            (checked if matches else corrupt).append(label)
    setup = home / 'roya-setup'
    candidates = [home / '.cache/prisma/master' / ENGINE_VERSION / 'debian-openssl-3.0.x/schema-engine']
    for pattern in ('*/node_modules/@prisma/engines/' + ENGINE_FILE,
                    '*/*/node_modules/@prisma/engines/' + ENGINE_FILE):
        candidates.extend(sorted(setup.glob(pattern))[:100])
    engines = []
    for path in dict.fromkeys(candidates):
        if (not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(home.resolve())
                or path.stat().st_size > 64 * 1024 * 1024):
            continue
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        engines.append({'path': str(path), 'bytes': path.stat().st_size,
                        'sha256': digest, 'matchesPreparedCandidate': digest == ENGINE_SHA256})
    return {'platform': {'os': operating_system, 'cpu': cpu, 'libc': libc},
            'cacheDirectory': str(cache), 'verifiedTarballs': len(checked),
            'skippedOtherPlatforms': skipped, 'missingCount': len(missing),
            'missing': missing[:40], 'missingListTruncated': len(missing) > 40,
            'corruptCount': len(corrupt), 'corrupt': corrupt[:40], 'engines': engines,
            'freeDiskMiB': shutil.disk_usage(home).free // (1024 * 1024),
            'scope': 'Checks content-addressed public tarballs and matching engine files only; does not prove npm cache index health, lifecycle scripts, an offline build or installation.'}


def main():
    if len(sys.argv) != 2 or os.getuid() == 0 or Path.home() != Path('/home/amir'):
        raise RuntimeError('Run as amir with the downloaded source archive, without sudo.')
    lock = read_lock(sys.argv[1])
    command = subprocess.run(['npm', 'config', 'get', 'cache'], capture_output=True,
                             text=True, timeout=8, check=False)
    cache = Path(command.stdout.strip())
    if command.returncode or not cache.is_absolute() or not cache.resolve().is_relative_to(Path.home()):
        raise RuntimeError('Unexpected npm cache location; nothing changed.')
    report = inventory(lock, cache, Path.home())
    print(json.dumps({'checkedAt': datetime.now(timezone.utc).isoformat(),
                      'readOnly': True, 'pinnedLockVerified': True, **report}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, KeyError, tarfile.TarError, subprocess.SubprocessError) as error:
        print('OFFLINE CACHE INSPECTION STOPPED:',
              str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
