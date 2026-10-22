#!/usr/bin/env python3
"""Actual Nginx basic auth, TLS trust, hostname checks and reload, in isolation."""
from pathlib import Path
from tempfile import TemporaryDirectory
import importlib.util
import os
import pwd
import ssl
import subprocess
import time

source=Path(__file__).resolve().parents[1]/'deploy/enable-private-domain-tls.py'
spec=importlib.util.spec_from_file_location('native_private_tls',source)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
password='NativePrivateRoya123!'
with TemporaryDirectory(prefix='roya-tls-native.') as temporary:
    root=Path(temporary);root.chmod(0o755)
    m.base.ACME=str(root/'acme')
    challenge=Path(m.base.ACME,'.well-known/acme-challenge');challenge.mkdir(parents=True)
    for path in (Path(m.base.ACME),challenge.parent,challenge):path.chmod(0o755)
    m.AUTH_DIR=str(root/'private');m.AUTH_FILE=str(root/'private/access.htpasswd')
    m.WEB_ROOT=str(root/'web');m.READY_FILE=str(root/'web/_roya_private_ready.txt')
    m.CERT=str(root/'certificate.pem');m.KEY=str(root/'key.pem');m.RENEWAL=str(root/'renewal.conf')
    Path(m.WEB_ROOT).mkdir();Path(m.WEB_ROOT).chmod(0o755);Path(m.READY_FILE).write_bytes(m.READY_BODY);Path(m.READY_FILE).chmod(0o644)
    account=pwd.getpwnam('nobody')
    Path(m.AUTH_DIR).mkdir();os.chown(m.AUTH_DIR,0,account.pw_gid);Path(m.AUTH_DIR).chmod(0o750)
    Path(m.AUTH_FILE).write_text(m.USERNAME+':'+m.password_hash(password)+'\n')
    os.chown(m.AUTH_FILE,0,account.pw_gid);Path(m.AUTH_FILE).chmod(0o640)
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','14',
                    '-keyout',m.KEY,'-out',m.CERT,'-subj','/CN='+m.DOMAIN,
                    '-addext','subjectAltName=DNS:'+m.DOMAIN+',DNS:www.'+m.DOMAIN],check=True,capture_output=True)
    Path(m.RENEWAL).write_text('[renewalparams]\nauthenticator = webroot\nrenew_hook = '+m.deployment_hook()+'\n')
    m.certificate_valid()
    original_domain=m.DOMAIN;m.DOMAIN='incorrect-name.invalid'
    try:
        try:m.certificate_valid()
        except RuntimeError:pass
        else:raise RuntimeError('Incorrect certificate SAN was accepted.')
    finally:m.DOMAIN=original_domain
    config=root/'nginx.conf'
    prefix=f'user nobody;\npid {root}/nginx.pid;\nerror_log {root}/error.log;\nevents {{ worker_connections 64; }}\nhttp {{ access_log off;\n'
    def render(body):
        return body.replace('listen 80;','listen 127.0.0.1:19280;').replace('listen 443 ssl;','listen 127.0.0.1:19443 ssl;').replace('    listen [::]:80;\n','').replace('    listen [::]:443 ssl;\n','').replace('/var/log/nginx/roya-private-domain-error.log',str(root/'private-error.log'))
    def write(body):config.write_text(prefix+render(body)+'\n}\n')
    def check():subprocess.run(['nginx','-t','-p',str(root)+'/', '-c',str(config)],check=True,capture_output=True)
    def reload():
        check();subprocess.run(['nginx','-p',str(root)+'/', '-c',str(config),'-s','reload'],check=True,capture_output=True)
    write(m.base.nginx_text());check()
    process=subprocess.Popen(['nginx','-p',str(root)+'/', '-c',str(config),'-g','daemon off;'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for attempt in range(60):
            try:
                if m.base.web(m.DOMAIN,'/',port=19280)[0]==404:break
            except OSError:pass
            if process.poll() is not None:raise RuntimeError('Isolated Nginx failed to start.')
            time.sleep(0.1)
        else:raise RuntimeError('Isolated Nginx did not become ready.')
        m.base.verify_web(http_port=19280,https_port=19443)
        write(m.tls_config());reload()
        m.verify_gate(password,port=19443,cafile=m.CERT)
        for host,cafile in ((m.DOMAIN,None),('wrong-name.invalid',m.CERT)):
            try:m.https(host,'/',port=19443,cafile=cafile)
            except ssl.SSLCertVerificationError:pass
            else:raise RuntimeError('TLS trust or hostname verification was bypassed.')
        if m.base.web(m.DOMAIN,'/api/health/',port=19280)[0]!=404:
            raise RuntimeError('HTTP application route must remain closed.')
        token='public-acme-test';probe=challenge/token;probe.write_text(token);probe.chmod(0o644)
        if m.base.web(m.DOMAIN,'/.well-known/acme-challenge/'+token,port=19280)[:2]!=(200,token.encode()):
            raise RuntimeError('ACME challenge was blocked by the private gate.')
        write(m.base.nginx_text());reload();m.base.verify_web(http_port=19280,https_port=19443)
        print('NATIVE PRIVATE TLS PASS: closed-to-private-to-closed reload, anonymous/wrong-password denial for all tested paths, correct private login, real worker file permissions, strict TLS trust/SNI, exact certificate SAN, public ACME and no application proxy.')
    finally:
        process.terminate();process.wait(timeout=10)
