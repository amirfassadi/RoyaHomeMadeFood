#!/usr/bin/env python3
"""Enable trusted TLS and a private access gate; never proxy to the storefront."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse
import base64
import fcntl
import getpass
import grp
import hashlib
import http.client
import importlib.util
import json
import os
import pwd
import re
import secrets
import shutil
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

spec = importlib.util.spec_from_file_location('roya_domain_base', Path(__file__).with_name('prepare-private-domain.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
DOMAIN, IP = base.DOMAIN, base.IP
AUTH_DIR = '/etc/nginx/roya-private-domain'
AUTH_FILE = AUTH_DIR + '/access.htpasswd'
WEB_ROOT = '/var/lib/roya/domain-private-gate'
READY_FILE = WEB_ROOT + '/_roya_private_ready.txt'
READY_BODY = b'ROYA_PRIVATE_GATE_READY\n'
CERT_ROOT = '/etc/letsencrypt/live/' + DOMAIN
CERT = CERT_ROOT + '/fullchain.pem'
KEY = CERT_ROOT + '/privkey.pem'
RENEWAL = '/etc/letsencrypt/renewal/' + DOMAIN + '.conf'
USERNAME = 'roya-preview'
MARKER = 'private-gate-v1'


def dns_questions():
    return [(DOMAIN, 'NS'), (DOMAIN, 'A'), ('www.' + DOMAIN, 'A'),
            ('ns1.' + DOMAIN, 'A'), ('ns2.' + DOMAIN, 'A'),
            (DOMAIN, 'AAAA'), ('www.' + DOMAIN, 'AAAA')]


def valid_dns_reply(name, kind, reply):
    if (not isinstance(reply, dict) or reply.get('_error') or reply.get('Status') != 0
            or reply.get('TC') or not isinstance(reply.get('Answer', []), list)
            or any(not isinstance(row, dict) for row in reply.get('Answer', []))):
        return False
    answer = reply.get('Answer', [])
    kind_id = {'NS': 2, 'A': 1, 'AAAA': 28}[kind]
    values = {str(row.get('data', '')).lower().rstrip('.') for row in answer if row.get('type') == kind_id}
    expected = {'ns1.' + DOMAIN, 'ns2.' + DOMAIN} if kind == 'NS' else {IP} if kind == 'A' else set()
    if values != expected:
        return False
    if name == 'www.' + DOMAIN and kind == 'A':
        aliases = {str(row.get('data', '')).lower().rstrip('.') for row in answer if row.get('type') == 5}
        if aliases != {DOMAIN}:
            return False
    return True


def valid_dns(replies):
    return (len(replies) == len(dns_questions())
            and all(valid_dns_reply(name, kind, reply) for (name, kind), reply in zip(dns_questions(), replies)))


DNS_STATUS = {0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN',
              4: 'NOTIMP', 5: 'REFUSED', 9: 'NOTAUTH'}


def query_doh(item):
    provider, name, kind = item
    try:
        request = urllib.request.Request(provider + '?name=' + name + '&type=' + kind,
                                         headers={'Accept': 'application/dns-json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            return {'_error': 'oversized response'}
        data = json.loads(raw)
        return data if isinstance(data, dict) else {'_error': 'invalid JSON object'}
    except urllib.error.HTTPError as error:
        return {'_error': 'HTTP ' + str(error.code)}
    except urllib.error.URLError as error:
        # Never print exception text: proxy URLs and credentials can appear there.
        reason = error.reason
        kind = ('TLS verification failed' if isinstance(reason, ssl.SSLCertVerificationError)
                else 'connection timeout' if isinstance(reason, (TimeoutError, socket.timeout))
                else 'connection failed')
        return {'_error': kind}
    except (TimeoutError, socket.timeout):
        return {'_error': 'connection timeout'}
    except OSError:
        return {'_error': 'connection failed'}
    except (ValueError, UnicodeError):
        return {'_error': 'invalid JSON response'}


def parse_tcp_dns(output):
    headers = re.findall(r'^;; ->>HEADER<<-.*?status: ([A-Z]+),', output, re.M)
    flags = re.findall(r'^;; flags: ([^;]*);', output, re.M)
    statuses = {value: key for key, value in DNS_STATUS.items()}
    if len(headers) != 1 or headers[0] not in statuses or len(flags) != 1 or 'qr' not in flags[0].split():
        return {'_error': 'invalid TCP DNS response'}
    answer = []
    types = {'A': 1, 'NS': 2, 'CNAME': 5, 'AAAA': 28}
    for line in output.splitlines():
        if not line.strip() or line.startswith(';'):
            continue
        match = re.fullmatch(r'(\S+)\s+\d+\s+IN\s+(A|NS|CNAME|AAAA)\s+(\S+)\s*', line)
        if not match:
            return {'_error': 'invalid TCP DNS answer'}
        name, kind, data = match.groups()
        answer.append({'name': name, 'type': types[kind], 'data': data})
    return {'Status': statuses[headers[0]], 'TC': 'tc' in flags[0].split(), 'Answer': answer}


def query_tcp(item):
    resolver, name, kind = item
    executable = shutil.which('dig')
    if not executable:
        return {'_error': 'dig unavailable'}
    try:
        result = subprocess.run([executable, '-r', '@' + resolver, name + '.', kind, '+tcp',
                                 '+time=3', '+tries=1', '+noall', '+comments', '+answer'],
                                capture_output=True, text=True, timeout=5, check=False)
        if result.returncode:
            return {'_error': 'TCP connection/query failed'}
        return parse_tcp_dns(result.stdout)
    except subprocess.TimeoutExpired:
        return {'_error': 'TCP connection timeout'}
    except (OSError, UnicodeError):
        return {'_error': 'TCP connection failed'}


def report_dns(label, replies):
    ready = valid_dns(replies)
    print('Public DNS ' + label + ': ' + ('verified' if ready else 'not verified'))
    if not ready:
        for index, (name, kind) in enumerate(dns_questions()):
            reply = replies[index] if index < len(replies) else {}
            reason = reply.get('_error') if isinstance(reply, dict) else 'invalid response'
            if not reason:
                status = reply.get('Status')
                if status != 0:
                    reason = DNS_STATUS.get(status, 'missing/unknown DNS status')
                elif valid_dns_reply(name, kind, reply):
                    continue
                else:
                    reason = 'record set differs, incomplete or truncated'
            print('  ' + name + ' ' + kind + ': ' + reason)
    return ready


def resolver_group(providers, query):
    tasks = [(address, name, kind) for _, address in providers for name, kind in dns_questions()]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(query, tasks))
    count = len(dns_questions())
    states = [report_dns(label, results[index * count:(index + 1) * count])
              for index, (label, _) in enumerate(providers)]
    return any(states)


def public_dns_ready():
    if resolver_group((('Google HTTPS', 'https://dns.google/resolve'),
                       ('Cloudflare HTTPS', 'https://cloudflare-dns.com/dns-query')), query_doh):
        return True
    print('Checking public resolvers over TCP/53; local DNS is not used as public proof.')
    # One fully consistent resolver is sufficient; a CA validation failure still
    # leaves the closed entry in place and never exposes the application.
    return resolver_group((('Google TCP', '8.8.8.8'), ('Cloudflare TCP', '1.1.1.1')), query_tcp)


def tls_config():
    http = base.nginx_text().split('\nserver {\n    listen 443 ssl;', 1)[0]
    return http + f'''
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name {DOMAIN} www.{DOMAIN};
    ssl_reject_handshake off;
    ssl_certificate {CERT};
    ssl_certificate_key {KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    access_log off;
    error_log /var/log/nginx/roya-private-domain-error.log warn;
    auth_basic "Roya private preview";
    auth_basic_user_file {AUTH_FILE};
    satisfy all;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "no-store" always;
    add_header X-Roya-Domain-Stage "{MARKER}" always;
    root {WEB_ROOT};
    autoindex off;
    location / {{ try_files $uri =404; }}
}}
'''


def https(host, path, authorization=None, method='GET', port=443, cafile=None):
    context = ssl.create_default_context(cafile=cafile)
    connection = http.client.HTTPSConnection(host, port, timeout=5, context=context)
    headers = {'Host': host}
    if authorization:
        headers['Authorization'] = authorization
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=5) as raw:
            connection.sock = context.wrap_socket(raw, server_hostname=host)
            connection.request(method, path, headers=headers)
            response = connection.getresponse()
            return response.status, response.read(65536), response.getheader('X-Roya-Domain-Stage'), response.getheader('WWW-Authenticate')
    finally:
        connection.close()


def verify_gate(password, port=443, cafile=None):
    deadline = time.monotonic() + 10
    while True:
        try:
            if all(https(host, '/', port=port, cafile=cafile)[::2] == (401, MARKER)
                   for host in (DOMAIN, 'www.' + DOMAIN)):
                break
        except (OSError, http.client.HTTPException):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('Private HTTPS gate did not become ready; certificate trust is required.')
        time.sleep(0.25)
    token = base64.b64encode((USERNAME + ':' + password).encode('ascii')).decode('ascii')
    wrong = 'Basic ' + base64.b64encode((USERNAME + ':' + uuid.uuid4().hex).encode()).decode()
    for host in (DOMAIN, 'www.' + DOMAIN):
        for path in ('/', '/fa/catalog/', '/en/rates/', '/admin/login/', '/api/health/',
                     '/api/admin/data/?section=settings', '/_next/static/test.js', '/_roya_private_ready.txt'):
            for method in ('GET', 'POST'):
                status, _, marker, challenge = https(host, path, method=method, port=port, cafile=cafile)
                if status != 401 or marker != MARKER or challenge != 'Basic realm="Roya private preview"':
                    raise RuntimeError(f'Private access failed: {method} {host}{path} HTTP {status}.')
        if https(host, '/_roya_private_ready.txt', wrong, port=port, cafile=cafile)[0] != 401:
            raise RuntimeError('Wrong private password was accepted.')
        status, body, marker, _ = https(host, '/_roya_private_ready.txt', 'Basic ' + token, port=port, cafile=cafile)
        if (status, body, marker) != (200, READY_BODY, MARKER):
            raise RuntimeError('Authorized private readiness check failed.')
        if https(host, '/api/health/', 'Basic ' + token, port=port, cafile=cafile)[0] != 404:
            raise RuntimeError('The storefront must not be connected in this TLS-only step.')


def password_hash(password):
    if not 12 <= len(password) <= 128 or any(not 33 <= ord(character) <= 126 for character in password):
        raise RuntimeError('Private password must be 12-128 printable ASCII characters, without spaces.')
    result = subprocess.run(['openssl', 'passwd', '-6', '-stdin'], input=password + '\n',
                            text=True, capture_output=True, check=False, timeout=10)
    digest = result.stdout.strip()
    if result.returncode or not re.fullmatch(r'\$6\$[./A-Za-z0-9]+\$[./A-Za-z0-9]{86}', digest):
        raise RuntimeError('Private password hashing failed; no password printed.')
    return digest


def worker_gid(config):
    users = re.findall(r'^\s*user\s+([A-Za-z0-9_-]+)(?:\s+([A-Za-z0-9_-]+))?\s*;', config, re.M)
    if len(users) != 1:
        raise RuntimeError('Exactly one explicit Nginx worker user is required.')
    user, group = users[0]
    account = pwd.getpwnam(user)
    return grp.getgrnam(group or user).gr_gid


def certificate_valid():
    for file in (CERT, KEY, RENEWAL):
        if not Path(file).is_file():
            raise RuntimeError('Roya certificate lineage is incomplete.')
    # OpenSSL -checkhost can exit zero even for a mismatch; check SAN explicitly.
    names = set(re.findall(r'DNS:([A-Za-z0-9.-]+)', base.command(
        ['openssl', 'x509', '-in', CERT, '-noout', '-ext', 'subjectAltName'])))
    if names != {DOMAIN, 'www.' + DOMAIN}:
        raise RuntimeError('Roya certificate must contain exactly apex and www SANs.')
    base.command(['openssl', 'x509', '-in', CERT, '-noout', '-checkend', '604800'])
    renewal = Path(RENEWAL).read_text()
    hook = re.search(r'(?m)^renew_hook\s*=\s*(.+?)\s*$', renewal)
    hook_value = hook[1] if hook else ''
    if len(hook_value) >= 2 and hook_value[0] == hook_value[-1] and hook_value[0] in ('"', "'"):
        hook_value = hook_value[1:-1]
    if not re.search(r'(?m)^authenticator\s*=\s*webroot\s*$', renewal) or hook_value != deployment_hook():
        raise RuntimeError('Roya renewal policy is not the expected webroot and reload hook.')


def deployment_hook():
    nginx, systemctl = shutil.which('nginx'), shutil.which('systemctl')
    if not nginx or not systemctl:
        raise RuntimeError('Nginx and systemctl are required.')
    return nginx + ' -t && ' + systemctl + ' reload nginx.service'


def certificate_commands(certbot):
    hook = deployment_hook()
    common = ['--non-interactive', '--agree-tos', '--register-unsafely-without-email']
    issue = [certbot, 'certonly', '--webroot', '--webroot-path', base.ACME, '--cert-name', DOMAIN,
             '-d', DOMAIN, '-d', 'www.' + DOMAIN, '--deploy-hook', hook] + common
    renew = [certbot, 'renew', '--cert-name', DOMAIN, '--dry-run', '--run-deploy-hooks',
             '--no-random-sleep-on-renew', '--deploy-hook', hook] + common
    return issue, renew


def protected_files(config):
    paths = base.included_files(base.NAMED) | {Path(base.ZONE), Path(base.INCLUDE)}
    paths.update(Path(name) for name in re.findall(r'^# configuration file ([^\n]+):$', config, re.M)
                 if name != base.NGINX)
    paths.update(Path(name) for name in re.findall(r'^\s*ssl_certificate(?:_key)?\s+"?([^";\s]+)"?\s*;', config, re.M))
    paths.update(Path(name) for name in ('/etc/roya/database.env', '/etc/roya/backend.env', '/etc/roya/preview.env',
                 '/etc/systemd/system/roya-preview.service', '/etc/systemd/system/roya-store.service',
                 '/opt/roya/preview-current/.roya-release'))
    paths.update(path for path in Path('/etc/letsencrypt/renewal').glob('*.conf') if path.name != DOMAIN + '.conf')
    return {str(path): base.sha(path) for path in paths}


def assert_protected(fingerprints):
    if any(base.sha(name) != digest for name, digest in fingerprints.items()):
        raise RuntimeError('An existing protected configuration or certificate changed.')


def verify_closed(**ports):
    # HTTP is identical in both stages, so its marker alone cannot prove that
    # a rollback has finished replacing the TLS workers.
    deadline = time.monotonic() + 10
    while True:
        try:
            base.verify_web(**ports)
            return
        except (RuntimeError, OSError):
            if time.monotonic() >= deadline:
                raise
        time.sleep(0.25)


def rollback(backup):
    backup = Path(backup)
    if (backup.is_symlink() or backup.parent != Path('/var/backups/roya')
            or not backup.name.startswith('domain-tls-') or backup.stat().st_uid != 0):
        raise RuntimeError('Unexpected TLS rollback directory.')
    state = json.loads((backup / 'state.json').read_text())
    if set(state['files']) != {base.NGINX, AUTH_FILE, READY_FILE}:
        raise RuntimeError('Unexpected TLS rollback file set.')
    for name, entry in state['files'].items():
        path = Path(name)
        if path.is_symlink() or (base.sha(path) if path.is_file() else None) not in (entry['before'], entry['after']):
            raise RuntimeError('Another edit changed a TLS target; rollback refused.')
        if entry['before'] is not None and base.sha(backup / entry['copy']) != entry['before']:
            raise RuntimeError('TLS backup checksum differs; rollback refused.')
    for name, entry in state['files'].items():
        if entry['before'] is None:
            Path(name).unlink(missing_ok=True)
        else:
            base.atomic(name, (backup / entry['copy']).read_bytes(), entry)
    base.command(['nginx', '-t'])
    base.command(['systemctl', 'reload', 'nginx.service'])
    verify_closed()
    base.preview_health()
    print('Closed domain entry restored. Roya certificate retained; application and DNS unchanged.')


def enable():
    if Path(base.NGINX).is_symlink() or Path(base.NGINX).read_text() != base.nginx_text():
        raise RuntimeError('Expected the exact prepared closed domain entry; nothing overwritten.')
    if Path('/opt/roya/preview-current/.roya-release').read_text().strip() != base.RELEASE:
        raise RuntimeError('Installed private preview release differs.')
    values = dict(line.split('=', 1) for line in Path('/etc/roya/preview.env').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    expected = {'HOSTNAME':'127.0.0.1', 'PORT':'3311', 'ROYA_DEPLOYMENT_ROLE':'standalone',
                'ROYA_PRIVATE_DB_CATALOG':'1', 'ROYA_DEMO_CATALOG':'1', 'ROYA_INDEXABLE':'0',
                'ROYA_LIVE_PAYMENTS':'0', 'ROYA_ACCEPT_ORDERS':'0', 'ROYA_SEND_SMS':'0',
                'ROYA_TRUST_GEO_HEADER':'0', 'NEXTAUTH_URL':'http://localhost:3311',
                'NEXT_PUBLIC_SITE_URL':'http://localhost:3311'}
    if any(values.get(key) != value for key, value in expected.items()):
        raise RuntimeError('Private preview configuration differs.')
    for service in base.SERVICES:
        base.command(['systemctl', 'is-active', '--quiet', service])
    base.preview_health()
    for tcp in (False, True):
        if base.dns(DOMAIN, 'A', tcp) != [f'{DOMAIN}. IN A {IP}']:
            raise RuntimeError('Prepared authoritative DNS differs.')
    base.verify_web()
    config = base.command(['nginx', '-T'])
    gid = worker_gid(config)
    fingerprints = protected_files(config)
    for name in (AUTH_FILE, READY_FILE):
        if os.path.lexists(name):
            raise RuntimeError('A private gate file already exists; nothing overwritten.')
    for name in (AUTH_DIR, WEB_ROOT):
        path = Path(name)
        if path.is_symlink() or (path.exists() and (not path.is_dir() or path.stat().st_uid != 0 or any(path.iterdir()))):
            raise RuntimeError('An intended private gate directory is not empty and root-owned.')
    certbot = next((path for path in ('/snap/bin/certbot', '/usr/bin/certbot') if os.access(path, os.X_OK)), None)
    if not certbot:
        raise RuntimeError('Certbot executable missing.')
    active_timer = False
    for timer in ('snap.certbot.renew.timer', 'certbot.timer'):
        try:
            base.command(['systemctl', 'is-active', '--quiet', timer])
            active_timer = True
            break
        except RuntimeError:
            pass
    if not active_timer:
        raise RuntimeError('An existing scheduled Certbot renewal timer is required.')
    if not public_dns_ready():
        print('DNS WAIT: public records are not verified. No certificate request, password prompt or configuration change.')
        return False
    issue, renew = certificate_commands(certbot)
    if any(os.path.lexists(name) for name in (CERT_ROOT, RENEWAL)):
        certificate_valid()
        print('Existing Roya certificate verified; no new production certificate requested.')
    else:
        print('Public DNS verified. Requesting the Roya-only trusted certificate; domain remains closed.', flush=True)
        base.command(issue, timeout=240)
        certificate_valid()
    assert_protected(fingerprints)
    print('Testing renewal for the Roya certificate only; domain remains closed.', flush=True)
    base.command(renew, timeout=240)
    assert_protected(fingerprints)
    print('Choose a separate private-preview password. Administrator password is unchanged.', flush=True)
    password = getpass.getpass('Private preview password (12-128 ASCII characters, hidden): ')
    confirm = getpass.getpass('Confirm private preview password (hidden): ')
    if not secrets.compare_digest(password.encode(), confirm.encode()):
        raise RuntimeError('Private passwords differ; domain remains closed.')
    digest = password_hash(password)
    backup_root = Path('/var/backups/roya')
    if backup_root.is_symlink() or backup_root.stat().st_uid != 0:
        raise RuntimeError('Unexpected backup directory.')
    backup = Path(tempfile.mkdtemp(prefix='domain-tls-', dir=backup_root))
    data = {AUTH_FILE: (USERNAME + ':' + digest + '\n').encode(), READY_FILE: READY_BODY,
            base.NGINX: tls_config().encode()}
    state = {'files': {}, 'protected': fingerprints}
    for index, (name, body) in enumerate(data.items()):
        path = Path(name)
        entry = {'before': None, 'after': hashlib.sha256(body).hexdigest()}
        if path.exists():
            info = path.stat()
            entry.update(before=base.sha(path), copy='original-' + str(index),
                         uid=info.st_uid, gid=info.st_gid, mode=stat.S_IMODE(info.st_mode))
            shutil.copyfile(path, backup / entry['copy'])
        state['files'][name] = entry
    (backup / 'state.json').write_text(json.dumps(state, sort_keys=True))
    shutil.copyfile(__file__, backup / 'enable-private-domain-tls.py')
    shutil.copyfile(Path(__file__).with_name('prepare-private-domain.py'), backup / 'prepare-private-domain.py')
    (backup / 'restore.sh').write_text('#!/bin/sh\nexec /usr/bin/python3 "$(dirname "$0")/enable-private-domain-tls.py" --rollback "$(dirname "$0")"\n')
    (backup / 'restore.sh').chmod(0o700)
    print('TLS gate configuration backup: ' + str(backup), flush=True)
    try:
        for name, group, mode in ((AUTH_DIR, gid, 0o750), (WEB_ROOT, 0, 0o755)):
            path = Path(name)
            if path.is_symlink() or (path.exists() and (not path.is_dir() or path.stat().st_uid != 0)):
                raise RuntimeError('Unexpected private gate directory.')
            path.mkdir(mode=mode, exist_ok=True)
            os.chown(path, 0, group)
            path.chmod(mode)
        for name, body in data.items():
            metadata = {'uid':0, 'gid':gid if name == AUTH_FILE else 0, 'mode':0o640 if name == AUTH_FILE else 0o644}
            base.atomic(name, body, metadata)
        base.command(['nginx', '-t'])
        base.command(['systemctl', 'reload', 'nginx.service'])
        verify_gate(password)
        assert_protected(fingerprints)
        base.preview_health()
        for service in base.SERVICES:
            base.command(['systemctl', 'is-active', '--quiet', service])
    except BaseException:
        try:
            rollback(backup)
        except BaseException:
            print('TLS ROLLBACK NEEDS REVIEW: sudo bash ' + str(backup / 'restore.sh'), file=sys.stderr)
        raise
    print('PRIVATE TLS GATE READY: trusted apex/www HTTPS, anonymous and wrong-password requests denied.')
    print('Private username: ' + USERNAME + '; password was not printed.')
    print('Only /_roya_private_ready.txt is available after private login; storefront connection is a separate step.')
    print('Application, database, DNS and existing certificates preserved. Payments, live orders and SMS remain disabled.')
    print('Rollback: sudo bash ' + str(backup / 'restore.sh'))
    return True


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--rollback')
    mode.add_argument('--dns-only', action='store_true', help='Read public DNS only; no sudo, CA, password or configuration access.')
    args = parser.parse_args()
    if args.dns_only:
        if not public_dns_ready():
            print('DNS WAIT: public records are not verified. No changes made.')
            sys.exit(2)
        print('PUBLIC DNS VERIFIED: read-only check; no changes made.')
        return
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
    elif not enable():
        sys.exit(2)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, EOFError, KeyboardInterrupt, subprocess.TimeoutExpired) as error:
        print('PRIVATE TLS STOPPED: ' + str(error) if isinstance(error, RuntimeError)
              else 'PRIVATE TLS STOPPED: ' + type(error).__name__ + '; private details omitted.', file=sys.stderr)
        sys.exit(1)
