#!/usr/bin/env python3
"""Prepare an authoritative zone and deny-all web entry, with guarded rollback."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import fcntl
import hashlib
import http.client
import json
import os
import pwd
import re
import shutil
import signal
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time
import uuid

DOMAIN = 'royahealthyfood.ir'
IP = '87.107.54.244'
RELEASE = '4497131e733c07627316685e3b91e7a62af75627'
NAMED = '/etc/named/named.conf'
ZONE = '/etc/named/config/royahealthyfood.ir.zone'
INCLUDE = '/etc/named/config/roya-private-domain.conf'
NGINX = '/etc/nginx/conf.d/roya-domain.conf'
ACME = '/var/lib/roya/domain-acme'
EXPECTED_ZONES = {'roghayemahdipour.ir', '244.54.107.87.in-addr.arpa'}
SERVICES = ('roya-preview.service', 'roya-store.service', 'nginx.service')
WEB_MARKER = 'closed-v1'


def command(args, timeout=15):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True,
                            text=True, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError('Command failed: ' + Path(args[0]).name + '; private output omitted.')
    return result.stdout


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic(path, data, metadata=None):
    path = Path(path)
    fd, stage = tempfile.mkstemp(prefix='.roya-domain-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(stage, metadata['mode'] if metadata else 0o644)
        os.chown(stage, metadata['uid'] if metadata else 0, metadata['gid'] if metadata else 0)
        os.replace(stage, path)
    finally:
        if os.path.lexists(stage):
            os.unlink(stage)


def named_pid():
    found = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            if (path / 'comm').read_text().strip() != 'named':
                continue
            argv = (path / 'cmdline').read_bytes().decode().split('\0')
            if ('-t' in argv or '-c' not in argv or argv.index('-c') + 1 >= len(argv)
                    or argv[argv.index('-c') + 1] != NAMED):
                raise RuntimeError('Unexpected running BIND configuration.')
            found.append(int(path.name))
        except (FileNotFoundError, ProcessLookupError):
            continue
    if len(found) != 1:
        raise RuntimeError('Exactly one expected BIND process is required.')
    return found[0]


def reload_named():
    pid = named_pid()
    # A pidfd prevents signalling a different process if the PID is reused.
    fd = os.pidfd_open(pid)
    try:
        signal.pidfd_send_signal(fd, signal.SIGHUP)
    finally:
        os.close(fd)


def dns(name, kind, tcp=False):
    args = ['dig', '@127.0.0.1', name, kind, '+norecurse', '+noall', '+comments', '+answer', '+time=2', '+tries=1']
    if tcp:
        args.append('+tcp')
    output = command(args, 5)
    flags = re.search(r'flags:\s*([^;]+);', output)
    if 'status: NOERROR' not in output or not flags or 'aa' not in flags[1].split():
        raise RuntimeError('Authoritative DNS answer required for ' + name + ' / ' + kind)
    return sorted(' '.join(line.split()[:1] + line.split()[2:]) for line in output.splitlines()
                  if line and not line.startswith(';'))


def web(host, path, method='GET', port=80):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        connection.request(method, path, headers={'Host': host})
        response = connection.getresponse()
        return response.status, response.read(65536), response.getheader('X-Roya-Domain-Stage')
    finally:
        connection.close()


def wait_web_ready(port=80, timeout_seconds=10):
    # Reload signals the master; it does not wait for new workers to serve traffic.
    deadline = time.monotonic() + timeout_seconds
    last = 'no response'
    while True:
        ready = True
        for host in (DOMAIN, 'www.' + DOMAIN):
            try:
                status, _, marker = web(host, '/', port=port)
                if marker == WEB_MARKER and status != 404:
                    raise RuntimeError(f'Domain gate failed: GET {host}/ HTTP {status}.')
                if marker != WEB_MARKER:
                    ready = False
                    last = f'GET {host}/ HTTP {status}; new configuration marker absent'
            except (OSError, http.client.HTTPException):
                ready = False
                last = f'GET {host}/ connection unavailable'
        if ready:
            return
        if time.monotonic() >= deadline:
            raise RuntimeError('Domain configuration did not become ready: ' + last + '.')
        time.sleep(0.25)


def verify_web(http_port=80, https_port=443):
    wait_web_ready(http_port)
    token = 'roya-readiness-' + uuid.uuid4().hex
    probe = Path(ACME, '.well-known/acme-challenge', token)
    probe.write_text(token)
    probe.chmod(0o644)
    try:
        for host in (DOMAIN, 'www.' + DOMAIN):
            for path in ('/', '/fa/catalog/', '/admin/login/', '/api/health/', '/_next/test.js'):
                for method in ('GET', 'POST'):
                    status, _, marker = web(host, path, method, http_port)
                    if status != 404 or marker != WEB_MARKER:
                        raise RuntimeError(f'Domain gate failed: {method} {host}{path} HTTP {status}; '
                                           f'new configuration marker {"present" if marker == WEB_MARKER else "absent"}.')
            status, body, marker = web(host, '/.well-known/acme-challenge/' + token, port=http_port)
            if status != 200 or body.decode() != token or marker != WEB_MARKER:
                raise RuntimeError(f'ACME challenge path failed: {host} HTTP {status}.')
            # Require an explicit rejection alert, not merely a connection failure.
            context = ssl.create_default_context()
            try:
                with socket.create_connection(('127.0.0.1', https_port), timeout=5) as raw:
                    with context.wrap_socket(raw, server_hostname=host):
                        raise RuntimeError('TLS entry unexpectedly accepted a connection.')
            except ssl.SSLError as error:
                if error.reason != 'TLSV1_UNRECOGNIZED_NAME':
                    raise RuntimeError('Expected a deliberate TLS rejection.') from None
    finally:
        probe.unlink(missing_ok=True)


def zone_text(serial):
    return f''' ; Managed Roya private domain
$ORIGIN {DOMAIN}.
$TTL 300
@ IN SOA ns1.{DOMAIN}. hostmaster.{DOMAIN}. ( {serial} 3600 600 1209600 300 )
@ IN NS ns1.{DOMAIN}.
@ IN NS ns2.{DOMAIN}.
@ IN A {IP}
ns1 IN A {IP}
ns2 IN A {IP}
www IN CNAME {DOMAIN}.
'''


def nginx_text():
    return f'''# Managed Roya private domain: closed until trusted HTTPS and private login
server {{
    listen 80;
    listen [::]:80;
    server_name {DOMAIN} www.{DOMAIN};
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Roya-Domain-Stage "{WEB_MARKER}" always;
    location ^~ /.well-known/acme-challenge/ {{ root {ACME}; try_files $uri =404; }}
    location / {{ return 404; }}
}}
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name {DOMAIN} www.{DOMAIN};
    ssl_reject_handshake on;
    location / {{ return 404; }}
}}
'''


def included_files(path, found=None):
    found = set() if found is None else found
    path = Path(path)
    if path in found:
        return found
    if not path.is_absolute() or not path.is_file():
        raise RuntimeError('Unexpected configuration include.')
    found.add(path)
    for name in re.findall(r'(?m)^\s*include\s+"([^"\n]+)"\s*;', path.read_text()):
        included_files(name, found)
    return found


def preview_health():
    connection = http.client.HTTPConnection('127.0.0.1', 3311, timeout=5)
    try:
        connection.request('GET', '/api/health/')
        response = connection.getresponse()
        response.read(65536)
        if response.status != 200:
            raise RuntimeError('Existing private preview health check failed.')
    finally:
        connection.close()


def rollback(backup):
    backup = Path(backup)
    if (backup.is_symlink() or backup.parent != Path('/var/backups/roya')
            or not backup.name.startswith('domain-prepare-') or backup.stat().st_uid != 0):
        raise RuntimeError('Unexpected rollback directory.')
    state = json.loads((backup / 'state.json').read_text())
    if set(state['files']) != {NAMED, ZONE, INCLUDE, NGINX}:
        raise RuntimeError('Unexpected rollback file set.')
    for name, entry in state['files'].items():
        path = Path(name)
        if path.is_symlink():
            raise RuntimeError('Rollback target became a symlink.')
        current = sha(path) if path.is_file() else None
        if current not in (entry['before'], entry['after']):
            raise RuntimeError('Another edit changed ' + name + '; rollback refused.')
        if entry['before'] is not None and sha(backup / entry['copy']) != entry['before']:
            raise RuntimeError('Backup checksum differs; rollback refused.')
    for name, entry in state['files'].items():
        if entry['before'] is None:
            Path(name).unlink(missing_ok=True)
        else:
            original = backup / entry['copy']
            atomic(name, original.read_bytes(), entry)
    command(['named-checkconf', NAMED])
    command(['nginx', '-t'])
    command(['systemctl', 'reload', 'nginx.service'])
    reload_named()
    print('Previous DNS and domain web configuration restored; application unchanged.')


def prepare():
    marker = Path('/opt/roya/preview-current/.roya-release')
    if not marker.is_file() or marker.read_text().strip() != RELEASE:
        raise RuntimeError('Installed private preview release differs.')
    values = dict(line.split('=', 1) for line in Path('/etc/roya/preview.env').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    expected = {'HOSTNAME': '127.0.0.1', 'PORT': '3311', 'ROYA_DEPLOYMENT_ROLE': 'standalone',
                'ROYA_PRIVATE_DB_CATALOG': '1', 'ROYA_DEMO_CATALOG': '1', 'ROYA_INDEXABLE': '0',
                'ROYA_LIVE_PAYMENTS': '0', 'ROYA_ACCEPT_ORDERS': '0', 'ROYA_SEND_SMS': '0',
                'NEXTAUTH_URL': 'http://localhost:3311', 'NEXT_PUBLIC_SITE_URL': 'http://localhost:3311'}
    if any(values.get(key) != value for key, value in expected.items()):
        raise RuntimeError('Private preview configuration differs.')
    for service in SERVICES:
        command(['systemctl', 'is-active', '--quiet', service])
    preview_health()
    addresses = json.loads(command(['ip', '-j', '-4', 'addr', 'show']))
    if IP not in {entry.get('local') for interface in addresses for entry in interface.get('addr_info', [])}:
        raise RuntimeError('Expected VPS IPv4 address is not assigned locally.')
    named_pid()
    if not Path(NAMED).is_file() or Path(NAMED).is_symlink():
        raise RuntimeError('Unexpected BIND configuration file.')
    config = command(['named-checkconf', '-p', NAMED])
    zones = set(re.findall(r'^\s*zone\s+"([^"\n]+)"', config, re.M))
    if zones != EXPECTED_ZONES or re.search(r'^\s*view\s+', config, re.M):
        raise RuntimeError('BIND zones or views changed since readiness inspection.')
    before_dns = {name: dns(name, 'SOA') for name in sorted(zones)}
    for name in zones:
        if not before_dns[name]:
            raise RuntimeError('Existing zone has no SOA answer.')
    current_nginx = command(['nginx', '-T'])
    names = re.findall(r'^\s*server_name\s+([^;]+);', current_nginx, re.M)
    if any(DOMAIN in value.split() or 'www.' + DOMAIN in value.split() for value in names):
        raise RuntimeError('Domain already has a web entry; nothing overwritten.')
    for name in (ZONE, INCLUDE, NGINX):
        if os.path.lexists(name):
            raise RuntimeError('An intended new file already exists; nothing overwritten.')
    protected = included_files(NAMED) - {Path(NAMED)}
    protected.update(Path(name) for name in re.findall(r'^# configuration file ([^\n]+):$', current_nginx, re.M))
    protected.update(Path(name) for name in re.findall(r'^\s*ssl_certificate(?:_key)?\s+"?([^";\s]+)"?\s*;', current_nginx, re.M))
    protected.update(Path(name) for name in ('/etc/roya/database.env', '/etc/roya/backend.env', '/etc/roya/preview.env',
                     '/etc/systemd/system/roya-preview.service', '/etc/systemd/system/roya-store.service'))
    fingerprints = {str(path): sha(path) for path in protected}
    if shutil.disk_usage('/var/backups').free < 64 * 1024 * 1024:
        raise RuntimeError('Insufficient space for configuration backup.')
    original = Path(NAMED).read_bytes()
    serial = datetime.now(timezone.utc).strftime('%Y%m%d') + '01'
    data = {ZONE: zone_text(serial).encode(), INCLUDE: (
        f'# Managed Roya private domain\nzone "{DOMAIN}" IN {{\n'
        f'    type master; file "{ZONE}";\n'
        '    allow-transfer { none; }; allow-update { none; }; notify no;\n};\n').encode(),
        NGINX: nginx_text().encode(), NAMED: original +
        (b'' if original.endswith(b'\n') else b'\n') +
        f'\n# Managed Roya private domain\ninclude "{INCLUDE}";\n'.encode()}
    backup_root = Path('/var/backups/roya')
    if backup_root.is_symlink() or (backup_root.exists() and backup_root.stat().st_uid != 0):
        raise RuntimeError('Unexpected backup directory.')
    backup_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='domain-prepare-', dir=backup_root))
    state = {'files': {}, 'protected': fingerprints, 'beforeDns': before_dns}
    for index, (name, body) in enumerate(data.items()):
        path = Path(name)
        entry = {'before': None, 'after': hashlib.sha256(body).hexdigest()}
        if path.exists():
            info = path.stat()
            entry.update(before=sha(path), copy='original-' + str(index),
                         uid=info.st_uid, gid=info.st_gid, mode=stat.S_IMODE(info.st_mode))
            shutil.copyfile(path, backup / entry['copy'])
        state['files'][name] = entry
    (backup / 'state.json').write_text(json.dumps(state, sort_keys=True))
    shutil.copyfile(__file__, backup / 'controller.py')
    (backup / 'restore.sh').write_text('#!/bin/sh\nexec /usr/bin/python3 "$(dirname "$0")/controller.py" --rollback "$(dirname "$0")"\n')
    (backup / 'restore.sh').chmod(0o700)
    print('Configuration backup: ' + str(backup), flush=True)
    try:
        challenge = Path(ACME, '.well-known/acme-challenge')
        for path in (Path(ACME), Path(ACME, '.well-known'), challenge):
            if path.is_symlink() or (path.exists() and (not path.is_dir() or path.stat().st_uid != 0)):
                raise RuntimeError('Unexpected ACME directory.')
            path.mkdir(mode=0o755, exist_ok=True)
            path.chmod(0o755)
        # Publish the closed web entry before making the zone authoritative.
        for name, body in data.items():
            atomic(name, body, state['files'][name] if state['files'][name]['before'] else None)
        command(['named-checkzone', DOMAIN, ZONE])
        command(['named-checkconf', NAMED])
        command(['nginx', '-t'])
        command(['systemctl', 'reload', 'nginx.service'])
        verify_web()
        reload_named()
        for attempt in range(12):
            try:
                if dns(DOMAIN, 'A') == [f'{DOMAIN}. IN A {IP}']:
                    break
            except RuntimeError:
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError('New authoritative zone did not load.')
        for tcp in (False, True):
            if dns(DOMAIN, 'A', tcp) != [f'{DOMAIN}. IN A {IP}']:
                raise RuntimeError('A record verification failed.')
            if dns(DOMAIN, 'NS', tcp) != sorted([f'{DOMAIN}. IN NS ns1.{DOMAIN}.', f'{DOMAIN}. IN NS ns2.{DOMAIN}.']):
                raise RuntimeError('NS verification failed.')
            for label in ('ns1', 'ns2'):
                if dns(label + '.' + DOMAIN, 'A', tcp) != [f'{label}.{DOMAIN}. IN A {IP}']:
                    raise RuntimeError('Nameserver address verification failed.')
            if dns('www.' + DOMAIN, 'CNAME', tcp) != [f'www.{DOMAIN}. IN CNAME {DOMAIN}.']:
                raise RuntimeError('www verification failed.')
        for name, records in before_dns.items():
            if dns(name, 'SOA') != records:
                raise RuntimeError('An existing DNS zone changed.')
        if any(sha(name) != digest for name, digest in fingerprints.items()):
            raise RuntimeError('An existing protected configuration changed.')
        for service in SERVICES:
            command(['systemctl', 'is-active', '--quiet', service])
        preview_health()
    except BaseException:
        try:
            rollback(backup)
        except BaseException:
            print('ROLLBACK NEEDS REVIEW: sudo bash ' + str(backup / 'restore.sh'), file=sys.stderr)
        raise
    print('PRIVATE DOMAIN DNS PREPARED: authoritative UDP/TCP records verified.')
    print('HTTP closed except ACME; TLS deliberately rejected; storefront remains on loopback.')
    print('IRNIC nameservers: ns1.' + DOMAIN + ' / ' + IP + '; ns2.' + DOMAIN + ' / ' + IP)
    print('Both nameservers currently share this VPS; independent DNS redundancy is not configured.')
    print('Rollback: sudo bash ' + str(backup / 'restore.sh'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rollback')
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
    else:
        prepare()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print('DOMAIN PREPARATION STOPPED: ' + str(error) if isinstance(error, RuntimeError)
              else 'DOMAIN PREPARATION STOPPED: ' + type(error).__name__ + '; private details omitted.', file=sys.stderr)
        sys.exit(1)
