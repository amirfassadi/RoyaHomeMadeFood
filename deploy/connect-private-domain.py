#!/usr/bin/env python3
"""Connect an HTTPS-built candidate behind the existing private gate, with rollback."""
from pathlib import Path
from dataclasses import dataclass
from http.cookies import SimpleCookie
import argparse
import base64
import fcntl
import getpass
import hashlib
import http.client
import importlib.util
import json
import os
import pwd
import re
import shutil
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import urlencode, urlparse

spec = importlib.util.spec_from_file_location('roya_origin_tls', Path(__file__).with_name('enable-private-domain-tls.py'))
tls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tls)
base = tls.base
ORIGIN = 'https://' + base.DOMAIN
SOURCE_RELEASE = '2e91933fed5e98ade0ca4b252546bad8e4d7c291'
MARKER = 'private-app-v1'
ENV = '/etc/roya/preview.env'
UNIT = '/etc/systemd/system/roya-preview.service'
LINK = '/opt/roya/preview-current'
RELEASE_ROOT = '/opt/roya/preview-releases'
CANDIDATE_UNIT = '/etc/systemd/system/roya-domain-candidate.service'
CANDIDATE_ENV = '/etc/roya/domain-candidate.env'
UPGRADING = False
PUBLIC_PREVIEW = False
PUBLIC_MARKER = 'public-preview-v1'

def configure_upgrade():
    global UPGRADING, SOURCE_RELEASE
    m = json.loads(Path(__file__).with_name('private-domain-upgrade-manifest.json').read_text())
    source = 'b417f463c203fc1986cbe2fb091fb59a6cb7c641'
    previous = '3f6a74cef79ac602d6b9f34f57eca7ed0989a54d'
    if (m.get('format') != 1 or m.get('origin') != ORIGIN or m.get('baseRelease') != previous
            or m.get('sourceRelease') != source
            or hashlib.sha1(json.dumps(m['files'], sort_keys=True).encode()).hexdigest() != source):
        raise RuntimeError('Unexpected private upgrade manifest.')
    UPGRADING, SOURCE_RELEASE, base.RELEASE = True, source, previous



def release_id():
    return hashlib.sha1(('roya-private-domain-v1\n' + SOURCE_RELEASE + '\n' + ORIGIN).encode()).hexdigest()


def previous_target():
    return str(Path(RELEASE_ROOT, base.RELEASE))


def environment(text, port):
    updates = {'NEXTAUTH_URL': ORIGIN, 'NEXT_PUBLIC_SITE_URL': ORIGIN,
               'ROYA_PREVIEW_RELEASE': release_id(), 'PORT': str(port)}
    lines = text.splitlines()
    for key, value in updates.items():
        if sum(line.startswith(key + '=') for line in lines) != 1:
            raise RuntimeError('Expected one private environment value for ' + key + '.')
        lines = [key + '=' + value if line.startswith(key + '=') else line for line in lines]
    return '\n'.join(lines) + '\n'


def service(text, release, candidate=False):
    old = previous_target()
    required = ['# Managed Roya private unified preview', 'User=roya-store', 'Group=roya-store',
                'WorkingDirectory=' + LINK, 'EnvironmentFile=/etc/roya/database.env',
                'EnvironmentFile=' + ENV, 'ExecStart=/opt/roya/tools/node/bin/node ' + LINK + '/server.js',
                'ReadWritePaths=' + old + '/.next']
    if any(text.splitlines().count(line) != 1 for line in required) or re.search(r'^Environment=', text, re.M):
        raise RuntimeError('Unexpected private application service configuration.')
    text = text.replace('ReadWritePaths=' + old + '/.next', 'ReadWritePaths=' + release + '/.next')
    if candidate:
        text = text.replace('WorkingDirectory=' + LINK, 'WorkingDirectory=' + release)
        text = text.replace('EnvironmentFile=' + ENV, 'EnvironmentFile=' + CANDIDATE_ENV)
        text = text.replace(' ' + LINK + '/server.js', ' ' + release + '/server.js')
    return text


def nginx_config(upstream_port=3311, public_preview=None):
    if public_preview is None:
        public_preview = PUBLIC_PREVIEW
    http = base.nginx_text().split('\nserver {\n    listen 443 ssl;', 1)[0]
    shared = f'''
    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_reject_handshake off;
    ssl_certificate {tls.CERT};
    ssl_certificate_key {tls.KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    access_log off;
    error_log /var/log/nginx/roya-private-domain-error.log warn;
    client_max_body_size 128k;
    auth_basic "Roya private preview";
    auth_basic_user_file {tls.AUTH_FILE};
    satisfy all;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "no-store" always;
    add_header X-Roya-Domain-Stage "{MARKER}" always;
'''
    text = http + '\nserver {\n' + shared + f'''
    server_name {base.DOMAIN};
    location = /_roya_private_ready.txt {{ root {tls.WEB_ROOT}; }}
    location / {{
        proxy_pass http://127.0.0.1:{upstream_port};
        proxy_http_version 1.1;
        proxy_set_header Host {base.DOMAIN};
        proxy_set_header X-Forwarded-Host {base.DOMAIN};
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port 443;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Forwarded "";
        proxy_set_header Authorization "";
        proxy_set_header X-Middleware-Subrequest "";
        proxy_set_header X-Vercel-IP-Country "";
        proxy_set_header CF-IPCountry "";
        proxy_set_header Connection "";
        proxy_read_timeout 35s;
        proxy_buffering off;
        proxy_hide_header X-Powered-By;
    }}
}}
server {{
''' + shared + f'''
    server_name www.{base.DOMAIN};
    root {tls.WEB_ROOT};
    # try_files runs after access checks; a server-level return would bypass auth.
    location / {{ try_files /_roya_never_serve_www @roya_apex; }}
    location @roya_apex {{ return 308 {ORIGIN}$request_uri; }}
}}
'''
    if public_preview:
        authorization = '    auth_basic "Roya private preview";\n    auth_basic_user_file ' + tls.AUTH_FILE + ';'
        if text.count(authorization) != 2:
            raise RuntimeError('Unexpected private authorization template.')
        text = text.replace(authorization, '    auth_basic off;')
        text = text.replace('X-Roya-Domain-Stage "' + MARKER + '"', 'X-Roya-Domain-Stage "' + PUBLIC_MARKER + '"')
    return text


def select_access_mode(text):
    global PUBLIC_PREVIEW
    for public in (False, True):
        if text == nginx_config(public_preview=public):
            PUBLIC_PREVIEW = public
            return
    raise RuntimeError('Expected the verified private domain gate or public test preview; nothing overwritten.')


@dataclass
class Reply:
    status: int
    body: bytes
    headers: list

    def header(self, name):
        return next((value for key, value in self.headers if key.lower() == name.lower()), None)

    def data(self):
        return json.loads(self.body)


def request(path, method='GET', headers=None, body=None, port=3312, secure=False, cafile=None, host=None):
    host = host or base.DOMAIN
    supplied = {'Host': host, 'X-Forwarded-Proto': 'https', **(headers or {})}
    if secure:
        context = ssl.create_default_context(cafile=cafile)
        connection = http.client.HTTPSConnection(host, port, context=context, timeout=15)
        raw = socket.create_connection(('127.0.0.1', port), timeout=15)
        connection.sock = context.wrap_socket(raw, server_hostname=host)
    else:
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=15)
    try:
        connection.request(method, path, body=body, headers=supplied)
        response = connection.getresponse()
        return Reply(response.status, response.read(4 * 1024 * 1024), response.getheaders())
    finally:
        connection.close()


def expect(reply, status, stage):
    if reply.status != status:
        raise RuntimeError(stage + ': expected HTTP ' + str(status) + ', received ' + str(reply.status) + '.')
    return reply


def verify_application(send):
    expect(send('/api/health/'), 200, 'Application health')
    catalog = expect(send('/api/shop/catalog/'), 200, 'Database catalog').data()
    if catalog.get('scope') != 'private-database' or catalog.get('catalog', {}).get('isDemo') is not True:
        raise RuntimeError('Expected the existing private database storefront.')
    if expect(send('/api/shop/pricing/'), 200, 'Shared pricing').data().get('scope') != 'store':
        raise RuntimeError('Shared pricing scope differs.')
    for locale in ('fa', 'en'):
        for path in ('', 'catalog/', 'cart/', 'checkout/', 'rates/', 'international/'):
            expect(send('/' + locale + '/' + path), 200, 'Storefront ' + locale + '/' + path)
    expect(send('/admin/login/'), 200, 'Administrator login page')
    expect(send('/api/admin/data/?section=settings'), 401, 'Administrator guest guard')
    expect(send('/api/internal/read/'), 404, 'Internal API guard')
    for path in ('/api/shop/checkout/', '/api/international/checkout/', '/api/payment/crypto/webhook/', '/api/customer/code/'):
        reply = expect(send(path, method='POST', headers={'Origin': ORIGIN, 'Content-Type': 'application/json'}, body=b'{}'), 503, 'Live-effect guard')
        if reply.data().get('error') != 'STAGING_ONLY':
            raise RuntimeError('Expected the existing live-effect block.')
    providers = expect(send('/api/auth/providers/'), 200, 'Authentication providers').data()
    if not providers or any(not value.get(key, '').startswith(ORIGIN + '/')
                            for value in providers.values() for key in ('signinUrl', 'callbackUrl')):
        raise RuntimeError('Authentication URLs do not use the canonical HTTPS origin.')
    csrf = expect(send('/api/auth/csrf/'), 200, 'CSRF')
    cookies = SimpleCookie()
    for key, value in csrf.headers:
        if key.lower() == 'set-cookie':
            cookies.load(value)
    token_cookie = cookies.get('__Host-next-auth.csrf-token')
    if (not token_cookie or not token_cookie['secure'] or not token_cookie['httponly']
            or token_cookie['path'] != '/' or token_cookie['domain'] or token_cookie['samesite'].lower() != 'lax'):
        raise RuntimeError('Secure host-only CSRF cookie policy differs.')
    jar = '; '.join(key + '=' + value.coded_value for key, value in cookies.items())
    form = urlencode({'csrfToken': csrf.data()['csrfToken'], 'callbackUrl': ORIGIN + '/admin/', 'json': 'true'}).encode()
    for origin in ('https://untrusted.invalid', 'http://localhost:3311', 'https://www.' + base.DOMAIN):
        reply = expect(send('/api/auth/signout/', method='POST', headers={'Cookie': jar, 'Origin': origin,
                       'Content-Type': 'application/x-www-form-urlencoded'}, body=form), 403, 'Wrong authentication origin')
        if reply.data().get('error') != 'ORIGIN':
            raise RuntimeError('Expected the authentication Origin guard.')
    result = expect(send('/api/auth/signout/', method='POST', headers={'Cookie': jar, 'Origin': ORIGIN,
                    'Content-Type': 'application/x-www-form-urlencoded'}, body=form), 200, 'Canonical authentication origin')
    if not result.data().get('url', '').startswith(ORIGIN + '/'):
        raise RuntimeError('Authentication callback escaped the HTTPS origin.')
    print('HTTPS APPLICATION CHECK PASS: FA/EN, catalog/pricing, secure CSRF cookie, canonical URLs, Origin guards and disabled live effects.')


def basic(password):
    return 'Basic ' + base64.b64encode((tls.USERNAME + ':' + password).encode('ascii')).decode('ascii')


def verify_proxy(password, port=443, cafile=None):
    if PUBLIC_PREVIEW:
        return verify_public_proxy(port=port, cafile=cafile)
    deadline = time.monotonic() + 10
    while True:
        try:
            reply = request('/', port=port, secure=True, cafile=cafile)
            if reply.status == 401 and reply.header('X-Roya-Domain-Stage') == MARKER:
                break
        except OSError:
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('New private application proxy did not become ready.')
        time.sleep(0.25)
    for host in (base.DOMAIN, 'www.' + base.DOMAIN):
        for path in ('/', '/fa/catalog/', '/api/health/', '/api/auth/csrf/', '/_next/static/test.js'):
            for method in ('GET', 'POST'):
                expect(request(path, method, port=port, secure=True, cafile=cafile, host=host), 401, 'Anonymous private gate')
        expect(request('/', headers={'Authorization': basic('DefinitelyWrong-' + uuid.uuid4().hex)},
                       port=port, secure=True, cafile=cafile, host=host), 401, 'Wrong private password')
    redirect = request('/fa/catalog/?check=1', headers={'Authorization': basic(password)},
                       port=port, secure=True, cafile=cafile, host='www.' + base.DOMAIN)
    if redirect.status != 308 or redirect.header('Location') != ORIGIN + '/fa/catalog/?check=1':
        raise RuntimeError('Authenticated www canonical redirect differs.')
    def send(path, method='GET', headers=None, body=None):
        return request(path, method, {'Authorization': basic(password), **(headers or {})}, body,
                       port=port, secure=True, cafile=cafile)
    verify_application(send)
    ready = expect(send('/_roya_private_ready.txt'), 200, 'Private readiness endpoint')
    if ready.body != tls.READY_BODY:
        raise RuntimeError('Private readiness body differs.')


def verify_public_proxy(port=443, cafile=None):
    deadline = time.monotonic() + 10
    while True:
        try:
            reply = request('/api/health/', port=port, secure=True, cafile=cafile)
            if reply.status == 200 and reply.header('X-Roya-Domain-Stage') == PUBLIC_MARKER:
                break
        except OSError:
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('Public test preview did not become ready.')
        time.sleep(0.25)

    def send(path, method='GET', headers=None, body=None, host=None):
        reply = request(path, method, headers, body, port=port, secure=True, cafile=cafile, host=host)
        if reply.header('WWW-Authenticate'):
            raise RuntimeError('Unexpected storefront password challenge.')
        if reply.header('X-Roya-Domain-Stage') != PUBLIC_MARKER:
            raise RuntimeError('Public test preview stage differs.')
        if not any(key.lower() == 'x-robots-tag' and 'noindex' in value.lower() for key, value in reply.headers):
            raise RuntimeError('Public test preview must remain noindex.')
        if not any(key.lower() == 'cache-control' and 'no-store' in value.lower() for key, value in reply.headers):
            raise RuntimeError('Public test preview must remain uncached.')
        return reply

    verify_application(send)
    redirect = send('/fa/catalog/?check=1', host='www.' + base.DOMAIN)
    if redirect.status != 308 or redirect.header('Location') != ORIGIN + '/fa/catalog/?check=1':
        raise RuntimeError('Anonymous www canonical redirect differs.')
    page = expect(send('/fa/catalog/'), 200, 'Anonymous catalog')
    asset = re.search(rb'src="(/_next/static/[^" ]+)"', page.body)
    if not asset or send(asset[1].decode().replace('&amp;', '&')).status != 200:
        raise RuntimeError('Anonymous storefront browser asset did not load.')
    robots = expect(send('/robots.txt'), 200, 'Preview robots policy')
    if not re.search(rb'(?im)^Disallow:\s*/\s*$', robots.body):
        raise RuntimeError('Preview robots policy must disallow crawling.')
    admin = expect(send('/admin/'), 307, 'Anonymous administrator page')
    target = urlparse(admin.header('Location') or '')
    if target.path.rstrip('/') != '/admin/login' or target.netloc not in ('', base.DOMAIN) or target.scheme not in ('', 'https'):
        raise RuntimeError('Administrator login redirect differs.')
    contact = expect(send('/api/contact/', method='POST', headers={'Origin': ORIGIN, 'Content-Type': 'application/json'}, body=b'{}'), 503, 'Preview contact submission')
    if contact.data().get('error') not in ('STAGING_ONLY', 'UNAVAILABLE'):
        raise RuntimeError('Preview contact submission must remain disabled.')
    callback = expect(send('/api/payment/callback/'), 503, 'Preview payment callback')
    if callback.data().get('error') != 'STAGING_ONLY':
        raise RuntimeError('Preview payment callbacks must remain disabled.')
    print('PUBLIC PREVIEW HTTPS CHECK PASS: anonymous FA/EN/assets, administrator guard, noindex, secure cookies and disabled live effects.')


def verify_access_ready():
    for host in (base.DOMAIN, 'www.' + base.DOMAIN):
        if PUBLIC_PREVIEW and host == base.DOMAIN:
            status, body, marker, _ = tls.https(host, '/_roya_private_ready.txt')
            if (status, body, marker) != (200, tls.READY_BODY, PUBLIC_MARKER):
                raise RuntimeError('Expected the anonymous test-preview entry.')
        elif PUBLIC_PREVIEW:
            reply = request('/fa/catalog/', port=443, secure=True, host=host)
            if reply.status != 308 or reply.header('X-Roya-Domain-Stage') != PUBLIC_MARKER:
                raise RuntimeError('Expected the anonymous www test-preview redirect.')
        elif tls.https(host, '/')[::2] != (401, MARKER if UPGRADING else tls.MARKER):
            raise RuntimeError('Expected the protected HTTPS gate before application connection.')


def preflight(resource_check=True):
    if Path(base.NGINX).is_symlink():
        raise RuntimeError('Expected the verified private domain gate; nothing overwritten.')
    if UPGRADING:
        select_access_mode(Path(base.NGINX).read_text())
    elif Path(base.NGINX).read_text() != tls.tls_config():
        raise RuntimeError('Expected the verified private domain gate; nothing overwritten.')
    if not Path(LINK).is_symlink() or str(Path(LINK).resolve()) != previous_target():
        raise RuntimeError('Installed private preview target differs.')
    if Path(LINK, '.roya-release').read_text().strip() != base.RELEASE:
        raise RuntimeError('Installed private preview release differs.')
    values = dict(line.split('=', 1) for line in Path(ENV).read_text().splitlines() if '=' in line and not line.startswith('#'))
    expected = {'HOSTNAME': '127.0.0.1', 'PORT': '3311', 'NEXTAUTH_URL': 'http://localhost:3311',
                'NEXT_PUBLIC_SITE_URL': 'http://localhost:3311', 'ROYA_DEPLOYMENT_ROLE': 'standalone',
                'ROYA_PRIVATE_DB_CATALOG': '1', 'ROYA_DEMO_CATALOG': '1', 'ROYA_INDEXABLE': '0',
                'ROYA_LIVE_PAYMENTS': '0', 'ROYA_ACCEPT_ORDERS': '0', 'ROYA_SEND_SMS': '0',
                'ROYA_INTERNATIONAL_ENABLED': '0', 'CUSTOMER_ACCOUNTS_ENABLED': '0', 'ROYA_TRUST_GEO_HEADER': '0',
                'ROYA_PREVIEW_RELEASE': base.RELEASE}
    if UPGRADING:
        expected.update({'NEXTAUTH_URL': ORIGIN, 'NEXT_PUBLIC_SITE_URL': ORIGIN})
        entries = [line.split('=', 1)[0] for line in Path(ENV).read_text().splitlines() if '=' in line and not line.startswith('#')]
        if len(entries) != len(set(entries)):
            raise RuntimeError('Duplicate private environment values.')
        database = dict(line.split('=', 1) for line in Path('/etc/roya/database.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
        for key in ('DATABASE_URL', 'DIRECT_URL'):
            u = urlparse(values.get(key, database.get(key, '')))
            if (u.scheme, u.hostname, u.port, u.path, u.username) != ('postgresql', '127.0.0.1', 5432, '/roya_store', 'roya_app') or not u.password:
                raise RuntimeError('Unexpected local Roya database target.')
    if any(values.get(key) != value for key, value in expected.items()) or len(values.get('NEXTAUTH_SECRET', '')) < 32:
        raise RuntimeError('Private preview flags, origin or secret differ.')
    if any(values.get(key) for key in ('SITES_STATIC_PREVIEW', 'NEXTAUTH_URL_INTERNAL', 'ROYA_BACKEND_URL')):
        raise RuntimeError('Unexpected application origin override.')
    service(Path(UNIT).read_text(), str(Path(RELEASE_ROOT, release_id())))
    for path in (UNIT + '.d', CANDIDATE_UNIT, CANDIDATE_UNIT + '.d', CANDIDATE_ENV):
        if os.path.lexists(path):
            raise RuntimeError('An unexpected application override or candidate already exists.')
    for service_name in base.SERVICES:
        base.command(['systemctl', 'is-active', '--quiet', service_name])
    base.preview_health()
    tls.certificate_valid()
    verify_access_ready()
    listeners = base.command(['ss', '-lntH', '( sport = :3311 )']).splitlines()
    if not listeners or any(line.split()[3] != '127.0.0.1:3311' for line in listeners):
        raise RuntimeError('Preview listener is not loopback-only.')
    if base.command(['ss', '-lntH', '( sport = :3312 )']).strip():
        raise RuntimeError('Candidate loopback port 3312 is occupied.')
    config = base.command(['nginx', '-T'])
    protected = tls.protected_files(config)
    protected = {name: digest for name, digest in protected.items()
                 if name not in {ENV, UNIT, LINK + '/.roya-release'}}
    for name in ((base.NGINX,) if UPGRADING else ()) + (tls.AUTH_FILE, tls.READY_FILE, tls.RENEWAL):
        protected[name] = base.sha(name)
    if resource_check and shutil.disk_usage('/opt/roya').free < 2500 * 1024 * 1024:
        raise RuntimeError('At least 2500 MiB free disk is required; nothing removed.')
    memory = re.search(r'^MemAvailable:\s+(\d+)\s+kB$', Path('/proc/meminfo').read_text(), re.M)
    if resource_check and (not memory or int(memory[1]) < 1800 * 1024):
        raise RuntimeError('At least 1800 MiB available memory is required for the build.')
    print('DOMAIN ORIGIN PREFLIGHT PASS: existing private gate, release, flags, certificate and loopback listeners verified.')
    return protected


def wait_app(port):
    deadline = time.monotonic() + 40
    while True:
        try:
            if request('/api/health/', port=port).status == 200:
                return
        except OSError:
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('Application did not become ready on loopback.')
        time.sleep(0.5)


def wait_static_gate():
    deadline = time.monotonic() + 10
    while True:
        try:
            # This static endpoint also works if the application being rolled back is down.
            verify_access_ready()
            return
        except (OSError, RuntimeError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('Previous HTTPS access profile did not become ready.')
        time.sleep(0.25)


def verify_candidate_files(state):
    for name, digest in state.get('candidate', {}).items():
        path = Path(name)
        if path.is_symlink() or (path.exists() and base.sha(path) != digest):
            raise RuntimeError('Another edit changed the candidate service; cleanup refused.')


def candidate_cleanup(state):
    verify_candidate_files(state)
    if Path(CANDIDATE_UNIT).exists():
        base.command(['systemctl', 'stop', 'roya-domain-candidate.service'])
    for name in state.get('candidate', {}):
        Path(name).unlink(missing_ok=True)
    base.command(['systemctl', 'daemon-reload'])


def rollback(directory):
    global PUBLIC_PREVIEW
    directory = Path(directory)
    if directory.is_symlink() or directory.parent != Path('/var/backups/roya') or not directory.name.startswith('domain-origin-') or directory.stat().st_uid != 0:
        raise RuntimeError('Unexpected domain-origin rollback directory.')
    state = json.loads((directory / 'state.json').read_text())
    if state.get('accessMode', 'private') not in ('private', 'public-preview'):
        raise RuntimeError('Unknown domain rollback access mode.')
    PUBLIC_PREVIEW = state.get('accessMode') == 'public-preview'
    if set(state['files']) != {ENV, UNIT, base.NGINX} or set(state['candidate']) != {CANDIDATE_ENV, CANDIDATE_UNIT}:
        raise RuntimeError('Unexpected domain-origin rollback targets.')
    allowed = {previous_target(), str(Path(RELEASE_ROOT, release_id()))}
    if state.get('old') != previous_target() or not Path(LINK).is_symlink() or str(Path(LINK).resolve()) not in allowed:
        raise RuntimeError('Another deployment changed the application target.')
    for name, row in state['files'].items():
        path = Path(name)
        if path.is_symlink() or base.sha(path) not in (row['before'], row['after']):
            raise RuntimeError('Another edit changed an origin target; rollback refused.')
        if not re.fullmatch(r'original-[0-2]', row['copy']) or base.sha(directory / row['copy']) != row['before']:
            raise RuntimeError('Origin backup checksum differs; rollback refused.')
    tls.assert_protected(state['protected'])
    verify_candidate_files(state)
    # Restore the previous password gate before switching the application back.
    row = state['files'][base.NGINX]
    base.atomic(base.NGINX, (directory / row['copy']).read_bytes(), row)
    base.command(['nginx', '-t'])
    base.command(['systemctl', 'reload', 'nginx.service'])
    wait_static_gate()
    for name in (ENV, UNIT):
        row = state['files'][name]
        base.atomic(name, (directory / row['copy']).read_bytes(), row)
    temporary = Path(LINK).with_name('.roya-origin-rollback-' + uuid.uuid4().hex)
    temporary.symlink_to(state['old'])
    os.replace(temporary, LINK)
    base.command(['systemctl', 'daemon-reload'])
    base.command(['systemctl', 'restart', 'roya-preview.service'])
    wait_app(3311)
    candidate_cleanup(state)
    tls.assert_protected(state['protected'])
    print('PUBLIC PREVIEW UPGRADE ROLLED BACK: previous HTTPS test application and access mode restored.' if PUBLIC_PREVIEW else 'PRIVATE DOMAIN UPGRADE ROLLED BACK: previous HTTPS application and private gate restored.' if UPGRADING else 'PRIVATE DOMAIN ORIGIN ROLLED BACK: static TLS password gate and previous loopback application restored.')


def install(stage):
    protected = preflight()
    stage = Path(stage).resolve()
    if not stage.is_relative_to(Path('/home/amir/roya-setup')) or not (stage / 'server.js').is_file():
        raise RuntimeError('Unexpected standalone candidate stage.')
    descriptor = json.loads((stage / '.roya-origin.json').read_text())
    if descriptor != {'release': release_id(), 'sourceRelease': SOURCE_RELEASE, 'origin': ORIGIN}:
        raise RuntimeError('Candidate origin descriptor differs.')
    release = Path(RELEASE_ROOT, release_id())
    if os.path.lexists(release):
        raise RuntimeError('Origin release already exists; nothing overwritten.')
    for path in stage.rglob('*'):
        if path.is_symlink() and not path.resolve().is_relative_to(stage):
            raise RuntimeError('Candidate contains an external symbolic link.')
    password = None
    if not PUBLIC_PREVIEW:
        password = getpass.getpass('Existing private-preview password (hidden; not the administrator password): ')
        if not re.fullmatch(r'[!-~]{12,128}', password):
            raise RuntimeError('Private password format invalid; no application changed.')
    (verify_proxy if UPGRADING else tls.verify_gate)(password)
    original_env, original_unit = Path(ENV).read_text(), Path(UNIT).read_text()
    new_env = environment(original_env, 3311).encode()
    new_unit = service(original_unit, str(release)).encode()
    data = {ENV: new_env, UNIT: new_unit, base.NGINX: nginx_config().encode()}
    candidate = {CANDIDATE_ENV: environment(original_env, 3312).encode(),
                 CANDIDATE_UNIT: service(original_unit, str(release), True).encode()}
    root = Path('/var/backups/roya')
    if root.is_symlink() or root.stat().st_uid != 0:
        raise RuntimeError('Unexpected backup root.')
    directory = Path(tempfile.mkdtemp(prefix='domain-origin-', dir=root))
    state = {'old': str(Path(LINK).resolve()), 'protected': protected, 'files': {},
             'accessMode': 'public-preview' if PUBLIC_PREVIEW else 'private',
             'candidate': {name: hashlib.sha256(body).hexdigest() for name, body in candidate.items()}}
    for index, (name, body) in enumerate(data.items()):
        path = Path(name)
        if path.is_symlink():
            raise RuntimeError('Unexpected origin target symlink.')
        info = path.stat()
        state['files'][name] = {'before': base.sha(path), 'after': hashlib.sha256(body).hexdigest(),
                                'copy': 'original-' + str(index), 'uid': info.st_uid,
                                'gid': info.st_gid, 'mode': stat.S_IMODE(info.st_mode)}
        shutil.copyfile(path, directory / ('original-' + str(index)))
    for name in ('connect-private-domain.py', 'enable-private-domain-tls.py', 'prepare-private-domain.py'):
        shutil.copyfile(Path(__file__).with_name(name), directory / name)
    if UPGRADING:
        shutil.copyfile(Path(__file__).with_name('private-domain-upgrade-manifest.json'), directory / 'private-domain-upgrade-manifest.json')
    (directory / 'state.json').write_text(json.dumps(state, sort_keys=True))
    (directory / 'restore.sh').write_text('#!/bin/sh\nexec /usr/bin/python3 "$(dirname "$0")/connect-private-domain.py" ' + ('--upgrade ' if UPGRADING else '') + '--rollback "$(dirname "$0")"\n')
    (directory / 'restore.sh').chmod(0o700)
    print('Origin configuration backup: ' + str(directory), flush=True)
    changed = False
    try:
        shutil.copytree(stage, release, symlinks=True)
        (release / '.roya-release').write_text(release_id() + '\n')
        account = pwd.getpwnam('roya-store')
        for path in [release, *release.rglob('*')]:
            if not path.is_symlink():
                os.chown(path, 0, 0)
                path.chmod(0o755 if path.is_dir() or path.stat().st_mode & 0o111 else 0o644)
        cache = release / '.next/cache'
        cache.mkdir(parents=True, exist_ok=True)
        for path in [cache, *cache.rglob('*')]:
            os.chown(path, account.pw_uid, account.pw_gid)
        for name, body in candidate.items():
            base.atomic(name, body, {'uid': 0, 'gid': 0, 'mode': 0o600 if name == CANDIDATE_ENV else 0o644})
        base.command(['systemctl', 'daemon-reload'])
        base.command(['systemctl', 'start', 'roya-domain-candidate.service'])
        wait_app(3312)
        verify_application(request)
        listeners = base.command(['ss', '-lntH', '( sport = :3312 )']).splitlines()
        if not listeners or any(line.split()[3] != '127.0.0.1:3312' for line in listeners):
            raise RuntimeError('Candidate listener must remain loopback-only.')
        tls.assert_protected(protected)
        if any(base.sha(name) != row['before'] for name, row in state['files'].items()):
            raise RuntimeError('An origin target changed during candidate testing.')
        changed = True
        for name in (ENV, UNIT):
            base.atomic(name, data[name], state['files'][name])
        temporary = Path(LINK).with_name('.roya-origin-' + uuid.uuid4().hex)
        temporary.symlink_to(release)
        os.replace(temporary, LINK)
        base.command(['systemctl', 'daemon-reload'])
        base.command(['systemctl', 'restart', 'roya-preview.service'])
        wait_app(3311)
        verify_application(lambda path, **options: request(path, port=3311, **options))
        base.atomic(base.NGINX, data[base.NGINX], state['files'][base.NGINX])
        base.command(['nginx', '-t'])
        base.command(['systemctl', 'reload', 'nginx.service'])
        verify_proxy(password)
        tls.assert_protected(protected)
        for service_name in base.SERVICES:
            base.command(['systemctl', 'is-active', '--quiet', service_name])
        candidate_cleanup(state)
    except BaseException:
        try:
            if changed:
                rollback(directory)
            else:
                candidate_cleanup(state)
        except BaseException:
            print('ORIGIN ROLLBACK NEEDS REVIEW: sudo bash ' + str(directory / 'restore.sh'), file=sys.stderr)
        raise
    print(('PUBLIC PREVIEW CONTENT UPGRADE READY: ' if PUBLIC_PREVIEW else 'PRIVATE CONTENT UPGRADE READY: ' if UPGRADING else 'PRIVATE DOMAIN STOREFRONT READY: ') + ORIGIN + '/fa/catalog/')
    print('HTTPS origin, secure cookies and Origin guards verified. ' + ('Anonymous test-preview access retained; administrator login is required.' if PUBLIC_PREVIEW else 'Private username remains ' + tls.USERNAME + '.'))
    print('Administrator, catalog/pricing, database schema, DNS, certificates and live-effect blocks preserved.')
    print('Rollback: sudo bash ' + str(directory / 'restore.sh'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--upgrade', action='store_true')
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--preflight', action='store_true')
    modes.add_argument('--install')
    modes.add_argument('--rollback')
    args = parser.parse_args()
    if args.upgrade:
        configure_upgrade()
    if os.geteuid() != 0:
        raise RuntimeError('Run with sudo python3 in the Roya VPS terminal.')
    os.environ['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    os.umask(0o077)
    lock = os.open('/home/amir/roya-setup/deploy.lock', os.O_RDWR | os.O_NOFOLLOW)
    if not stat.S_ISREG(os.fstat(lock).st_mode) or os.fstat(lock).st_uid != pwd.getpwnam('amir').pw_uid:
        raise RuntimeError('Unexpected deployment lock.')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if args.preflight:
        preflight()
    elif args.install:
        install(args.install)
    else:
        rollback(args.rollback)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, EOFError, KeyboardInterrupt, http.client.HTTPException, subprocess.TimeoutExpired) as error:
        print('PRIVATE DOMAIN ORIGIN STOPPED: ' + str(error) if isinstance(error, RuntimeError)
              else 'PRIVATE DOMAIN ORIGIN STOPPED: ' + type(error).__name__ + '; private details omitted.', file=sys.stderr)
        sys.exit(1)
