#!/usr/bin/env python3
"""Real Nginx -> HTTPS-origin Next.js -> isolated PostgreSQL; no public service."""
from pathlib import Path
from tempfile import TemporaryDirectory
from http.cookies import SimpleCookie
import grp
import importlib.util
import json
import os
import pwd
import re
import secrets
import subprocess
import time
from urllib.parse import urlencode, urlparse

SOURCE = Path(__file__).resolve().parents[1] / 'deploy/connect-private-domain.py'
spec = importlib.util.spec_from_file_location('native_domain_origin', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
database = os.environ.get('ROYA_INTEGRATION_DATABASE_URL', '')
if urlparse(database).path not in ('/roya_test', '/roya_integration_test'):
    raise RuntimeError('Only an isolated integration database is allowed.')
private_password = secrets.token_urlsafe(24)
administrator_password = secrets.token_urlsafe(24)
mobile = '09' + str(secrets.randbelow(10**9)).zfill(9)
fixture_id = None
app = nginx = None


def fixture(action):
    code = '''
import {getDb} from './src/lib/server/db.ts';
import {hashPassword} from './src/lib/admin/password.ts';
const parts=[];for await(const part of process.stdin)parts.push(part);
const value=JSON.parse(Buffer.concat(parts).toString());const db=getDb();
try{
 if(value.action==='create'){
  const user=await db.user.create({data:{name:'HTTPS origin verification',mobile:value.mobile,passwordHash:await hashPassword(value.password),role:'ADMIN'}});
  console.log(JSON.stringify({id:user.id,orders:await db.order.count()}));
 }else{
  const orders=await db.order.count();await db.adminAudit.deleteMany({where:{adminId:value.id}});await db.user.delete({where:{id:value.id}});
  console.log(JSON.stringify({orders}));
 }
}finally{await db.$disconnect();}
'''
    value = {'action': action, 'mobile': mobile, 'password': administrator_password, 'id': fixture_id}
    result = subprocess.run(['node', '--conditions=react-server', '--import', 'tsx', '--input-type=module', '-e', code],
                            input=json.dumps(value), text=True, capture_output=True, timeout=30, check=False,
                            env={**os.environ, 'DATABASE_URL': database})
    if result.returncode:
        raise RuntimeError('Isolated HTTPS administrator fixture failed; private output omitted.')
    return json.loads(result.stdout)


with TemporaryDirectory(prefix='roya-domain-origin-native.') as temporary:
    root = Path(temporary)
    root.chmod(0o755)
    tls = m.tls
    tls.AUTH_DIR = str(root / 'private')
    tls.AUTH_FILE = str(root / 'private/access.htpasswd')
    tls.WEB_ROOT = str(root / 'web')
    tls.READY_FILE = str(root / 'web/_roya_private_ready.txt')
    tls.CERT = str(root / 'certificate.pem')
    tls.KEY = str(root / 'key.pem')
    m.base.ACME = str(root / 'acme')
    Path(tls.WEB_ROOT).mkdir(mode=0o755)
    Path(tls.READY_FILE).write_bytes(tls.READY_BODY)
    Path(tls.READY_FILE).chmod(0o644)
    Path(m.base.ACME, '.well-known/acme-challenge').mkdir(parents=True)
    account = pwd.getpwnam('nobody')
    group = grp.getgrgid(account.pw_gid).gr_name
    Path(tls.AUTH_DIR).mkdir(mode=0o750)
    os.chown(tls.AUTH_DIR, 0, account.pw_gid)
    Path(tls.AUTH_FILE).write_text(tls.USERNAME + ':' + tls.password_hash(private_password) + '\n')
    Path(tls.AUTH_FILE).chmod(0o640)
    os.chown(tls.AUTH_FILE, 0, account.pw_gid)
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '14',
                    '-keyout', tls.KEY, '-out', tls.CERT, '-subj', '/CN=' + m.base.DOMAIN,
                    '-addext', 'subjectAltName=DNS:' + m.base.DOMAIN + ',DNS:www.' + m.base.DOMAIN], check=True, capture_output=True)
    config = root / 'nginx.conf'
    prefix = f'user nobody {group};\npid {root}/nginx.pid;\nerror_log {root}/error.log;\nevents {{ worker_connections 128; }}\nhttp {{ access_log off; satisfy any; allow 127.0.0.1; deny all;\n'
    def write_config(body):
        body = body.replace('listen 80;', 'listen 127.0.0.1:19380;').replace('    listen [::]:80;\n', '')
        body = body.replace('listen 443 ssl;', 'listen 127.0.0.1:19445 ssl;').replace('    listen [::]:443 ssl;\n', '')
        body = body.replace('/var/log/nginx/roya-private-domain-error.log', str(root / 'private-error.log'))
        config.write_text(prefix + body + '\n}\n')
        result = subprocess.run(['nginx', '-t', '-p', str(root) + '/', '-c', str(config)], capture_output=True)
        if result.returncode:
            raise RuntimeError('Native application proxy syntax failed.')
    def send(path, method='GET', headers=None, body=None, host=None):
        return m.request(path, method, {'Authorization': m.basic(private_password), **(headers or {})}, body,
                         port=19445, secure=True, cafile=tls.CERT, host=host)
    try:
        created = fixture('create')
        fixture_id = created['id']
        env = {**os.environ, 'DATABASE_URL': database, 'DIRECT_URL': database,
               'NEXTAUTH_URL': m.ORIGIN, 'NEXT_PUBLIC_SITE_URL': m.ORIGIN,
               'NEXTAUTH_SECRET': 'isolated-https-origin-secret-that-is-not-a-production-secret',
               'HOSTNAME': '127.0.0.1', 'PORT': '4314', 'ROYA_DEPLOYMENT_ROLE': 'standalone',
               'ROYA_DEMO_CATALOG': '1', 'ROYA_PRIVATE_DB_CATALOG': '1',
               'ROYA_INDEXABLE': '0', 'ROYA_LIVE_PAYMENTS': '0', 'ROYA_ACCEPT_ORDERS': '0',
               'ROYA_SEND_SMS': '0', 'ROYA_INTERNATIONAL_ENABLED': '0', 'CUSTOMER_ACCOUNTS_ENABLED': '0',
               'ROYA_TRUST_GEO_HEADER': '0'}
        for key in ('NEXTAUTH_URL_INTERNAL', 'SITES_STATIC_PREVIEW', 'ROYA_BACKEND_URL'):
            env.pop(key, None)
        with (root / 'app.log').open('w') as log:
            app = subprocess.Popen(['node', '.next/standalone/server.js'], env=env, stdout=log, stderr=log)
        m.wait_app(4314)
        write_config(m.nginx_config(4314))
        nginx = subprocess.Popen(['nginx', '-p', str(root) + '/', '-c', str(config), '-g', 'daemon off;'],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        m.verify_proxy(private_password, port=19445, cafile=tls.CERT)
        page = send('/fa/catalog/')
        if b'http://localhost:3311' in page.body or b'http://127.0.0.1:3311' in page.body:
            raise RuntimeError('Loopback origin leaked into the public page.')
        asset = re.search(rb'src="(/_next/static/[^"?]+[^" ]*)"', page.body)
        if not asset or send(asset[1].decode().replace('&amp;', '&')).status != 200:
            raise RuntimeError('Private Next.js browser asset did not load.')
        jar = {}
        def client(path, method='GET', headers=None, body=None):
            reply = send(path, method, {'Cookie': '; '.join(k + '=' + v for k, v in jar.items()), **(headers or {})}, body)
            for name, value in reply.headers:
                if name.lower() == 'set-cookie':
                    parsed = SimpleCookie()
                    parsed.load(value)
                    for key, item in parsed.items():
                        if item.value:
                            jar[key] = item.coded_value
                        else:
                            jar.pop(key, None)
            return reply
        csrf = client('/api/auth/csrf/').data()['csrfToken']
        form = urlencode({'csrfToken': csrf, 'mobile': mobile, 'password': administrator_password,
                          'callbackUrl': m.ORIGIN + '/admin/', 'json': 'true'}).encode()
        login = m.expect(client('/api/auth/callback/credentials/', 'POST',
                         {'Origin': m.ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'}, form), 200, 'HTTPS administrator login')
        secure_session = False
        for name, value in login.headers:
            if name.lower() == 'set-cookie' and value.startswith('__Secure-next-auth.session-token='):
                cookie = SimpleCookie()
                cookie.load(value)
                item = cookie['__Secure-next-auth.session-token']
                secure_session = bool(item['secure'] and item['httponly'] and item['path'] == '/' and not item['domain'] and item['samesite'].lower() == 'lax')
        if not secure_session or client('/api/auth/session/').data().get('adminId') != fixture_id:
            raise RuntimeError('HTTPS secure administrator session failed.')
        m.expect(client('/admin/products/'), 200, 'Authenticated HTTPS administrator page')
        m.expect(send('/api/admin/settings/content/'), 401, 'Content API without administrator session')
        m.expect(client('/admin/content/'), 200, 'Authenticated HTTPS content editor')
        m.expect(client('/api/admin/settings/content/'), 200, 'Authenticated HTTPS content read')
        for origin in ('https://untrusted.invalid', 'http://localhost:3311'):
            m.expect(client('/api/admin/settings/pricing/', 'POST', {'Origin': origin, 'Content-Type': 'application/json'}, b'{}'), 403, 'Administrator wrong Origin')
        m.expect(client('/api/admin/settings/pricing/', 'POST', {'Origin': m.ORIGIN, 'Content-Type': 'application/json'}, b'{}'), 400, 'Administrator same-origin validation')
        m.expect(client('/api/admin/settings/content/', 'POST', {'Origin': 'https://untrusted.invalid', 'Content-Type': 'application/json'}, b'{}'), 403, 'Content wrong Origin')
        m.expect(client('/api/admin/settings/content/', 'POST', {'Origin': m.ORIGIN, 'Content-Type': 'application/json'}, b'{}'), 400, 'Content same-origin validation')
        forged = send('/api/auth/providers/', headers={'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'http', 'Forwarded': 'host=attacker.invalid;proto=http'})
        if any(not row['callbackUrl'].startswith(m.ORIGIN + '/') for row in forged.data().values()):
            raise RuntimeError('Forwarded headers changed the canonical authentication origin.')
        csrf = client('/api/auth/csrf/').data()['csrfToken']
        form = urlencode({'csrfToken': csrf, 'callbackUrl': m.ORIGIN + '/admin/login/', 'json': 'true'}).encode()
        m.expect(client('/api/auth/signout/', 'POST', {'Origin': m.ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'}, form), 200, 'HTTPS administrator logout')
        m.expect(client('/api/admin/data/?section=settings'), 401, 'Logged-out HTTPS administrator')
        m.expect(client('/api/admin/settings/content/'), 401, 'Logged-out HTTPS content API')
        # Exercise the exact operator transport/probe against real NextAuth,
        # not only the synthetic HTTPS fixture. Secrets travel through stdin.
        diagnostic_code = '''
import {readFileSync} from 'node:fs';
import {domainTransport,ORIGIN} from './deploy/diagnose-domain-admin.mjs';
import {probeLogin} from './deploy/diagnose-vps-admin.mjs';
import {probeProducts} from './deploy/private-product-probe.mjs';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const value=JSON.parse(Buffer.concat(chunks).toString());
const send=domainTransport({password:value.privatePassword,port:19445,ca:readFileSync(value.certificate)});
await probeLogin({base:ORIGIN,origin:ORIGIN,mobile:value.mobile,password:value.password,send,settings:true});
const product=await probeProducts({base:ORIGIN,origin:ORIGIN,mobile:value.mobile,password:value.password,send,catalogTest:true});
if(!product.passed||!product.cleanupComplete)throw new Error('HTTPS product verification or cleanup failed.');
let interrupted=false;
const failOneUpdate=(url,init={})=>{
 if(!interrupted&&url===ORIGIN+'/api/admin/products/'&&init.method==='POST'&&JSON.parse(init.body).id){
  interrupted=true;return Promise.resolve(new Response('{}',{status:503}));
 }
 return send(url,init);
};
const failed=await probeProducts({base:ORIGIN,origin:ORIGIN,mobile:value.mobile,password:value.password,send:failOneUpdate,catalogTest:true});
if(!interrupted||failed.passed||!failed.cleanupComplete||!failed.logoutVerified||!failed.fixtureId)throw new Error('HTTPS interrupted product cleanup failed.');
console.log('NATIVE PRODUCT FAILURE CLEANUP PASS');
'''
        diagnostic = subprocess.run(['node', '--input-type=module', '-e', diagnostic_code],
                                    input=json.dumps({'privatePassword': private_password,
                                                      'mobile': mobile, 'password': administrator_password,
                                                      'certificate': tls.CERT}),
                                    text=True, capture_output=True, timeout=60, check=False)
        if diagnostic.returncode or 'ADMIN LOGIN PASS:' not in diagnostic.stdout:
            raise RuntimeError('Native HTTPS operator diagnostic failed; private output omitted.')
        print('NATIVE DOMAIN ADMIN DIAGNOSTIC PASS: operator transport, real secure NextAuth cookies, settings read and logout.')
        if 'DATABASE CATALOG VPS PASS:' not in diagnostic.stdout:
            raise RuntimeError('Native HTTPS product test did not complete; private output omitted.')
        print('NATIVE DOMAIN PRODUCT PASS: exact operator product probe, price, stock, capacity, FA/EN pages and archive removal.')
        if 'NATIVE PRODUCT FAILURE CLEANUP PASS' not in diagnostic.stdout:
            raise RuntimeError('Interrupted native product cleanup did not complete; private output omitted.')
        print('NATIVE PRODUCT FAILURE CLEANUP PASS: interrupted update archived only its fixture and verified logout.')
        m.configure_upgrade()
        m.verify_proxy(private_password, port=19445, cafile=tls.CERT)
        print('NATIVE HTTPS UPGRADE CHECK PASS: exact upgrade HTTPS verifier preserves authentication, secure cookies, origins and disabled live effects.')
        write_config(tls.tls_config())
        subprocess.run(['nginx', '-p', str(root) + '/', '-c', str(config), '-s', 'reload'], check=True, capture_output=True)
        tls.verify_gate(private_password, port=19445, cafile=tls.CERT)
        print('NATIVE HTTPS ORIGIN PASS: real private Nginx/Next.js/PostgreSQL, FA/EN/assets, secure admin login/session/logout, Origin rejection, canonical www, disabled live effects and return to static private gate.')
    finally:
        for process in (nginx, app):
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
        if fixture_id:
            after = fixture('delete')
            if after['orders'] != created['orders']:
                raise RuntimeError('HTTPS verification changed the order count.')
