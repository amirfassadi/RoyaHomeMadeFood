#!/usr/bin/env python3
"""Discard only a completed candidate's redundant local build dependencies/cache."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import shutil
import stat
import sys

SETUP_ROOT = Path('/home/amir/roya-setup')


def compact(candidate, manifest):
    candidate = Path(candidate)
    stage = candidate / '.roya-domain-stage'
    if (candidate.resolve() != candidate or candidate.parent != SETUP_ROOT
            or not candidate.name.startswith('domain-source.') or stage.resolve() != stage):
        raise RuntimeError('Unexpected Roya candidate path; nothing removed.')
    source = manifest['sourceRelease']
    origin = 'https://royahealthyfood.ir'
    if (manifest.get('format') != 1 or manifest.get('origin') != origin
            or hashlib.sha1(json.dumps(manifest['files'], sort_keys=True).encode()).hexdigest() != source):
        raise RuntimeError('Unexpected source manifest; nothing removed.')
    descriptor = {'release': hashlib.sha1(('roya-private-domain-v1\n' + source + '\n' + origin).encode()).hexdigest(),
                  'sourceRelease': source, 'origin': origin}
    for directory in (candidate, stage):
        if json.loads((directory / '.roya-origin.json').read_text()) != descriptor:
            raise RuntimeError('Candidate descriptor differs; nothing removed.')
    if not (stage / 'server.js').is_file() or not (stage / '.next/BUILD_ID').is_file():
        raise RuntimeError('Standalone candidate is incomplete; nothing removed.')
    for path in stage.rglob('*'):
        if path.is_symlink() and not path.resolve(strict=True).is_relative_to(stage):
            raise RuntimeError('Standalone candidate has an external dependency; nothing removed.')
    removable = [candidate / 'node_modules', candidate / '.next']
    if any(path.is_symlink() or (path.exists() and not path.is_dir()) for path in removable):
        raise RuntimeError('Unexpected build dependency/cache path; nothing removed.')
    before = shutil.disk_usage(SETUP_ROOT).free
    for path in removable:
        if path.is_dir():
            shutil.rmtree(path)
    reclaimed = max(0, shutil.disk_usage(SETUP_ROOT).free - before) // (1024 * 1024)
    print('Redundant candidate build files removed inside Roya setup only; reclaimed MiB:', reclaimed)
    print('Prepared standalone stage retained:', stage)


def main():
    if os.getuid() == 0 or Path.home() != Path('/home/amir'):
        raise RuntimeError('Run as amir, without sudo.')
    if len(sys.argv) != 2:
        raise RuntimeError('A completed candidate directory is required.')
    lock = os.open(SETUP_ROOT / 'deploy.lock', os.O_RDWR | os.O_NOFOLLOW)
    info = os.fstat(lock)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
        raise RuntimeError('Unexpected deployment lock.')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    manifest = json.loads(Path(__file__).with_name('private-domain-upgrade-manifest.json').read_text())
    compact(sys.argv[1], manifest)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        print('BUILD COMPACTION STOPPED:', str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
