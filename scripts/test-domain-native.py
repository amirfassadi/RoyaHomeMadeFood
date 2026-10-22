#!/usr/bin/env python3
"""Real Nginx/SSL and BIND validators on isolated loopback ports and temp files."""
from pathlib import Path
from tempfile import TemporaryDirectory
import importlib.util
import subprocess
import time

source=Path(__file__).resolve().parents[1]/'deploy/prepare-private-domain.py'
spec=importlib.util.spec_from_file_location('domain_prepare_native',source)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with TemporaryDirectory(prefix='roya-domain-native.') as temporary:
 root=Path(temporary);root.chmod(0o755)
 m.ACME=str(root/'acme');challenge=Path(m.ACME,'.well-known/acme-challenge');challenge.mkdir(parents=True)
 for path in (Path(m.ACME),challenge.parent,challenge):path.chmod(0o755)
 zone=root/'roya.zone';zone.write_text(m.zone_text('2026102201'))
 subprocess.run(['named-checkzone',m.DOMAIN,str(zone)],check=True,capture_output=True)
 body=m.nginx_text().replace('listen 80;','listen 127.0.0.1:18080;').replace('listen 443 ssl;','listen 127.0.0.1:18443 ssl;')
 body=body.replace('    listen [::]:80;\n','').replace('    listen [::]:443 ssl;\n','')
 config=root/'nginx.conf'
 prefix=f'pid {root}/nginx.pid;\nerror_log {root}/error.log;\nevents {{ worker_connections 64; }}\nhttp {{ access_log off;\n'
 # Start with an old default site, then exercise a real asynchronous reload.
 config.write_text(prefix+'server { listen 127.0.0.1:18080; return 200 "old site"; }\n}\n')
 subprocess.run(['nginx','-t','-p',str(root)+'/', '-c',str(config)],check=True,capture_output=True)
 process=subprocess.Popen(['nginx','-p',str(root)+'/', '-c',str(config),'-g','daemon off;'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  for attempt in range(60):
   try:
    if m.web(m.DOMAIN,'/',port=18080)[0]==200:break
   except OSError:pass
   if process.poll() is not None:raise RuntimeError('Isolated Nginx failed to start.')
   time.sleep(0.1)
  else:raise RuntimeError('Isolated Nginx did not become ready.')
  config.write_text(prefix+body+'\n}\n')
  subprocess.run(['nginx','-t','-p',str(root)+'/', '-c',str(config)],check=True,capture_output=True)
  subprocess.run(['nginx','-p',str(root)+'/', '-c',str(config),'-s','reload'],check=True,capture_output=True)
  m.verify_web(http_port=18080,https_port=18443)
  print('NATIVE DOMAIN PASS: real reload from an old default site, BIND zone validation, HTTP GET/POST denial, isolated ACME probe, explicit TLS rejection for apex and www.')
 finally:
  process.terminate();process.wait(timeout=10)
