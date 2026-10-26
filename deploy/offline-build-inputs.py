#!/usr/bin/env python3
"""Verify offline build inputs and restore one already cached Prisma engine."""
from pathlib import Path
import argparse
import base64
import hashlib
import os
import platform
import shutil

LOCK_SHA256 = 'e816e899d7c093baa40cddd5da216e1a1742977a5496fc8623c15a3b97febd76'
TARBALL_SHA512 = 'hS/0Wt3Ya043oKXs0sIxrMpKQITXhMLIrVAKKXi4gozGC9v7YRWVnXIZzjNPTO02M9BdxLCWqK1yRXgNziVyJQ=='
ENGINE_SHA256 = '29557c21d47da6f1695ec1a747cb6c607dade5e44e8b3e4fa687bd4dc226956d'
ENGINE_VERSION = '0edf323efd1d98336f3f0a68684b56f689b900d3'
ENGINE_FILE = 'schema-engine-debian-openssl-3.0.x'


def digest(path, algorithm, maximum):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > maximum:
        raise RuntimeError('Missing or unexpected offline input: ' + path.name)
    with path.open('rb') as source:
        return hashlib.file_digest(source, algorithm).digest()


def verified_inputs(root, candidate, home):
    root, candidate, home = map(Path, (root, candidate, home))
    setup = home / 'roya-setup'
    if (candidate.resolve() != candidate or candidate.parent != setup
            or not candidate.name.startswith('domain-source.')):
        raise RuntimeError('Unexpected candidate path; nothing installed.')
    if (platform.system() != 'Linux' or platform.machine().lower() not in ('x86_64', 'amd64')
            or platform.libc_ver()[0] != 'glibc'):
        raise RuntimeError('This offline engine requires Linux x64 glibc.')
    for directory in (root, candidate):
        if digest(directory / 'package-lock.json', 'sha256', 1000000).hex() != LOCK_SHA256:
            raise RuntimeError('Offline package-lock differs from the pinned application.')
    tarball = root / 'deploy/vendor/fast-uri-3.1.9.tgz'
    if base64.b64encode(digest(tarball, 'sha512', 1000000)).decode() != TARBALL_SHA512:
        raise RuntimeError('Offline fast-uri package differs from lock integrity.')
    engine = home / '.cache/prisma/master' / ENGINE_VERSION / 'debian-openssl-3.0.x/schema-engine'
    if not engine.resolve().is_relative_to(home.resolve()):
        raise RuntimeError('Unexpected Prisma cache location.')
    if digest(engine, 'sha256', 64 * 1024 * 1024).hex() != ENGINE_SHA256:
        raise RuntimeError('Cached Prisma engine differs from the verified candidate engine.')
    return engine


def restore_engine(root, candidate, home):
    candidate = Path(candidate)
    engine = verified_inputs(root, candidate, home)
    directory = candidate / 'node_modules/@prisma/engines'
    if not directory.is_dir() or directory.is_symlink() or not directory.resolve().is_relative_to(candidate):
        raise RuntimeError('Offline Prisma dependency was not installed inside this candidate.')
    target = directory / ENGINE_FILE
    if target.is_symlink() or (target.exists() and not target.is_file()):
        raise RuntimeError('Unexpected engine target; nothing overwritten.')
    shutil.copyfile(engine, target)
    os.chmod(target, 0o755)
    if digest(target, 'sha256', 64 * 1024 * 1024).hex() != ENGINE_SHA256:
        raise RuntimeError('Restored engine failed integrity verification.')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('verify', 'restore-engine'))
    parser.add_argument('source', type=Path)
    parser.add_argument('candidate', type=Path)
    arguments = parser.parse_args()
    if os.getuid() == 0 or Path.home() != Path('/home/amir'):
        raise RuntimeError('Run as amir, without sudo.')
    if arguments.mode == 'verify':
        verified_inputs(arguments.source, arguments.candidate, Path.home())
        print('OFFLINE INPUTS VERIFIED: pinned lock, fast-uri tarball and cached Prisma engine.')
    else:
        restore_engine(arguments.source, arguments.candidate, Path.home())
        print('OFFLINE ENGINE RESTORED: verified bytes copied into the isolated candidate only.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        print('OFFLINE BUILD STOPPED:', str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1)
