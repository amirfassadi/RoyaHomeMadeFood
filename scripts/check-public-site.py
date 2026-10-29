#!/usr/bin/env python3
"""Low-volume read-only public checks; never send SMS or create orders."""
from concurrent.futures import ThreadPoolExecutor
import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

BASE = 'https://royahealthyfood.ir'
PATHS = ['/api/health/', '/api/shop/mobile/code/', '/api/admin/data/?section=orders', '/fa/', '/robots.txt', '/sitemap.xml']


def check(path):
    request = Request(BASE + path, headers={'User-Agent': 'Roya-ReadOnly-Health/1.0'})
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError('Unexpected response size')
        expected = 401 if path.startswith('/api/admin/') else 200
        if response.status != expected:
            raise ValueError(f'HTTP {response.status}; expected {expected}')
        if path == '/api/health/' and json.loads(body).get('status') != 'ok':
            raise ValueError('Application health is not OK')
        if path == '/api/shop/mobile/code/':
            data = json.loads(body)
            if not isinstance(data.get('enabled'), bool) or not isinstance(data.get('required'), bool):
                raise ValueError('Mobile-verification policy unavailable')
        if path.startswith('/api/admin/'):
            if json.loads(body).get('error') != 'UNAUTHORIZED' or 'no-store' not in response.headers.get('Cache-Control', ''):
                raise ValueError('Admin protection or cache policy changed')
        if path == '/fa/':
            for header in ('Content-Security-Policy', 'X-Content-Type-Options', 'Strict-Transport-Security'):
                if not response.headers.get(header):
                    raise ValueError(f'Missing {header}')
        if path == '/robots.txt' and 'Sitemap:' not in body.decode():
            raise ValueError('Missing sitemap declaration')
        if path == '/sitemap.xml':
            root = ET.fromstring(body)
            if not root.tag.endswith('urlset'):
                raise ValueError('Invalid sitemap')
            for item in root.iter():
                if item.tag.endswith('loc') and item.text and any(part in item.text for part in ('/admin/', '/checkout/', '/account/', '/tracking/', '/api/')):
                    raise ValueError('Private route included in sitemap')
    return path


if __name__ == '__main__':
    failed = False
    with ThreadPoolExecutor(max_workers=2) as executor:
        jobs = {path: executor.submit(check, path) for path in PATHS}
        for path, job in jobs.items():
            try:
                job.result()
                print('PASS', path)
            except Exception as error:
                failed = True
                print('FAIL', path, type(error).__name__, str(error))
    sys.exit(1 if failed else 0)
