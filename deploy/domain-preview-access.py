#!/usr/bin/env python3
"""Change only the known Roya HTTPS password gate; keep all live effects off."""
from pathlib import Path
import argparse
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
import pwd
import shutil
import stat
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location('roya_preview_access_origin', Path(__file__).with_name('connect-private-domain.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BACKUPS = '/var/backups/roya'
SOURCES = {
    '3f6a74cef79ac602d6b9f34f57eca7ed0989a54d': '2ce213315171f1bba64211e27a8b46797d71bf96',
    '8f272a29a383ccc64b88964eea7e7dde0bd9db39': 'b417f463c203fc1986cbe2fb091fb59a6cb7c641',
    '321f8929648c9fcf2bdcfda3e270352b0b9d2174': 'e500aeab698926995bbbb853e02851ecb694cc11',
    '6e5669e0d5add140ff60cd6164f94673143582b1': 'db9dd404ceaebf2af49c5d531080248e4a3f2e81',
}
DEPENDENCIES = ('domain-preview-access.py', 'connect-private-domain.py',
                'enable-private-domain-tls.py', 'prepare-private-domain.py')


def installed():
    link = Path(m.LINK)
    if not link.is_symlink():
        raise RuntimeError('Expected the existing installed preview link.')
    release = (link / '.roya-release').read_text().strip()
    if release not in SOURCES or str(link.resolve()) != str(Path(m.RELEASE_ROOT, release)):
        raise RuntimeError('Unsupported installed release; no access configuration changed.')
    m.UPGRADING, m.base.RELEASE, m.SOURCE_RELEASE = True, release, SOURCES[release]
    if m.release_id() != release:
        raise RuntimeError('Installed source identity differs.')
    return release


def verify_surface():
    if m.PUBLIC_PREVIEW:
        m.verify_public_proxy()
    else:
        m.wait_static_gate()
        for host in (m.base.DOMAIN, 'www.' + m.base.DOMAIN):
            for path in ('/', '/fa/catalog/', '/en/catalog/', '/admin/', '/api/health/',
                         '/api/auth/csrf/', '/api/admin/data/?section=settings', '/_next/static/check.js'):
                reply = m.request(path, port=443, secure=True, host=host)
                if (reply.status != 401 or reply.header('X-Roya-Domain-Stage') != m.MARKER
                        or reply.header('WWW-Authenticate') != 'Basic realm="Roya private preview"'):
                    raise RuntimeError('The restored private gate did not deny anonymous access.')
        m.verify_application(lambda path, **options: m.request(path, port=3311, **options))


def assert_unchanged(state):
    if installed() != state['release'] or str(Path(m.LINK).resolve()) != state['target']:
        raise RuntimeError('Another deployment changed the application; access rollback refused.')
    m.tls.assert_protected(state['protected'])


def rollback(directory):
    directory = Path(directory)
    if (directory.is_symlink() or directory.parent != Path(BACKUPS)
            or not directory.name.startswith('domain-access-') or directory.stat().st_uid != 0):
        raise RuntimeError('Unexpected access rollback directory.')
    state = json.loads((directory / 'state.json').read_text())
    if (state.get('format') != 1 or state.get('domain') != m.base.DOMAIN
            or state.get('release') not in SOURCES
            or state.get('beforeMode') not in ('private', 'public-preview')
            or state.get('afterMode') not in ('private', 'public-preview')
            or state['beforeMode'] == state['afterMode']):
        raise RuntimeError('Unexpected access rollback state.')
    original = directory / 'original.conf'
    if original.is_symlink() or m.base.sha(original) != state['before']:
        raise RuntimeError('Access backup checksum differs; rollback refused.')
    if original.read_text() != m.nginx_config(public_preview=state['beforeMode'] == 'public-preview'):
        raise RuntimeError('Access backup configuration differs; rollback refused.')
    if state['after'] != hashlib.sha256(m.nginx_config(public_preview=state['afterMode'] == 'public-preview').encode()).hexdigest():
        raise RuntimeError('Access destination configuration differs; rollback refused.')
    path = Path(m.base.NGINX)
    if path.is_symlink() or m.base.sha(path) not in (state['before'], state['after']):
        raise RuntimeError('Another operator edited the domain configuration; rollback refused.')
    assert_unchanged(state)
    m.base.atomic(path, original.read_bytes(), state['metadata'])
    m.base.command(['nginx', '-t'])
    m.base.command(['systemctl', 'reload', 'nginx.service'])
    m.PUBLIC_PREVIEW = state['beforeMode'] == 'public-preview'
    # Readiness is static: restoration must work even if the application is down.
    m.wait_static_gate()
    assert_unchanged(state)
    print('PREVIEW ACCESS RESTORED: ' + state['beforeMode'] + '; application and live-effect settings unchanged.')


def change(public):
    release = installed()
    guarded = {name: m.base.sha(name) for name in (m.ENV, m.UNIT, m.LINK + '/.roya-release', m.base.NGINX)}
    protected = m.preflight(resource_check=False)
    # Check the real loopback application before changing who can reach it.
    m.verify_application(lambda path, **options: m.request(path, port=3311, **options))
    m.tls.assert_protected(guarded)
    if m.PUBLIC_PREVIEW == public:
        verify_surface()
        m.tls.assert_protected({**protected, **guarded})
        print(('PUBLIC TEST PREVIEW READY: ' if public else 'PRIVATE PREVIEW GATE READY: ') + m.ORIGIN + '/fa/catalog/')
        print('Access mode already matches; no configuration changed.')
        return
    path = Path(m.base.NGINX)
    original = path.read_bytes()
    previous_public = m.PUBLIC_PREVIEW
    if original != m.nginx_config(public_preview=previous_public).encode():
        raise RuntimeError('Domain configuration changed during preflight; nothing overwritten.')
    target = m.nginx_config(public_preview=public).encode()
    protected.pop(m.base.NGINX, None)
    protected.update({name: digest for name, digest in guarded.items() if name != m.base.NGINX})
    root = Path(BACKUPS)
    if root.is_symlink() or not root.is_dir() or root.stat().st_uid != 0:
        raise RuntimeError('Unexpected Roya backup root.')
    directory = Path(tempfile.mkdtemp(prefix='domain-access-', dir=root))
    info = path.stat()
    state = {'format': 1, 'domain': m.base.DOMAIN, 'release': release,
             'target': str(Path(m.LINK).resolve()), 'protected': protected,
             'beforeMode': 'public-preview' if previous_public else 'private',
             'afterMode': 'public-preview' if public else 'private',
             'before': hashlib.sha256(original).hexdigest(), 'after': hashlib.sha256(target).hexdigest(),
             'metadata': {'uid': info.st_uid, 'gid': info.st_gid, 'mode': stat.S_IMODE(info.st_mode)}}
    (directory / 'original.conf').write_bytes(original)
    for name in DEPENDENCIES:
        shutil.copyfile(Path(__file__).with_name(name), directory / name)
    (directory / 'state.json').write_text(json.dumps(state, sort_keys=True))
    (directory / 'restore.sh').write_text('#!/bin/sh\nexec /usr/bin/python3 "$(dirname "$0")/domain-preview-access.py" --rollback "$(dirname "$0")"\n')
    (directory / 'restore.sh').chmod(0o700)
    print('Preview access configuration backup: ' + str(directory), flush=True)
    changed = False
    try:
        assert_unchanged(state)
        if m.base.sha(path) != state['before']:
            raise RuntimeError('Domain configuration changed during preflight; nothing overwritten.')
        changed = True
        m.base.atomic(path, target, state['metadata'])
        m.base.command(['nginx', '-t'])
        m.base.command(['systemctl', 'reload', 'nginx.service'])
        m.PUBLIC_PREVIEW = public
        verify_surface()
        assert_unchanged(state)
        for service in m.base.SERVICES:
            m.base.command(['systemctl', 'is-active', '--quiet', service])
    except BaseException:
        if changed:
            try:
                rollback(directory)
            except BaseException:
                print('ACCESS ROLLBACK NEEDS REVIEW: sudo bash ' + str(directory / 'restore.sh'), file=sys.stderr)
        raise
    print(('PUBLIC TEST PREVIEW READY: ' if public else 'PRIVATE PREVIEW GATE READY: ') + m.ORIGIN + '/fa/catalog/')
    print('Administrator login remains required. Real orders, payments, SMS and contact submissions remain disabled; noindex stays enabled.')
    print('Rollback: sudo bash ' + str(directory / 'restore.sh'))


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--open', action='store_true', help='Allow anonymous access to the test storefront.')
    modes.add_argument('--close', action='store_true', help='Restore the existing private password gate.')
    modes.add_argument('--check', action='store_true', help='Verify the current access mode without changing configuration.')
    modes.add_argument('--rollback')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Run with sudo python3 in the Roya VPS terminal.')
    os.environ['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    os.umask(0o077)
    lock = os.open('/home/amir/roya-setup/deploy.lock', os.O_RDWR | os.O_NOFOLLOW)
    if not stat.S_ISREG(os.fstat(lock).st_mode) or os.fstat(lock).st_uid != pwd.getpwnam('amir').pw_uid:
        raise RuntimeError('Unexpected deployment lock.')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if args.rollback:
        rollback(args.rollback)
    elif args.check:
        installed()
        m.preflight(resource_check=False)
        verify_surface()
        print('PREVIEW ACCESS CHECK PASS: ' + ('public-preview' if m.PUBLIC_PREVIEW else 'private') + '; no configuration changed.')
    else:
        change(args.open)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, EOFError, KeyboardInterrupt,
            http.client.HTTPException, subprocess.TimeoutExpired) as error:
        print('PREVIEW ACCESS STOPPED: ' + str(error) if isinstance(error, RuntimeError)
              else 'PREVIEW ACCESS STOPPED: ' + type(error).__name__ + '; private details omitted.', file=sys.stderr)
        sys.exit(1)
