#!/usr/bin/env python3
"""Remove only the confirmed public storefront's Nginx noindex header.

Dry-run by default. Requires root with --apply; never changes other virtual hosts.
"""
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

TARGET = Path('/etc/nginx/conf.d/roya-domain.conf')
ALLOWED_HOSTS = {'royahealthyfood.ir', 'www.royahealthyfood.ir'}


def verify_public_headers():
    # Reload returns before the master has necessarily replaced old workers.
    # Require two consecutive clean requests, each on a new connection.
    clean = 0
    for attempt in range(10):
        response = subprocess.run(['curl', '--noproxy', '*', '--fail', '--silent', '--show-error', '--head', '--max-time', '5', '--resolve', 'royahealthyfood.ir:443:127.0.0.1', 'https://royahealthyfood.ir/fa/'], capture_output=True, text=True)
        blocked = re.search(r'^X-Robots-Tag:[^\r\n]*(?:noindex|none)\b', response.stdout, re.I | re.M)
        clean = clean + 1 if response.returncode == 0 and not blocked else 0
        if clean >= 2:
            return
        if attempt < 9:
            time.sleep(1)
    raise RuntimeError('Public HTTPS checks did not become clean after reload; a noindex header or request failure remains.')


def rewrite(text):
    active = '\n'.join(line.split('#', 1)[0] for line in text.splitlines())
    hosts = {host for group in re.findall(r'\bserver_name\s+([^;]+);', active) for host in group.split()}
    if not hosts or not hosts <= ALLOWED_HOSTS:
        raise ValueError('Unexpected virtual hosts; refusing to edit this file.')
    pattern = re.compile(r'^[ \t]*add_header[ \t]+X-Robots-Tag[ \t]+[^\n;]*\bnoindex\b[^\n;]*;[ \t]*(?:#[^\n]*)?$', re.I | re.M)
    updated, count = pattern.subn('    # Public indexing is controlled by the application SEO settings.', text)
    if not count:
        raise ValueError('No direct noindex header found here. It may be inherited from an include; no changes made.')
    return updated, count


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise SystemExit('Usage: enable-public-indexing.py [--apply]')
    if TARGET.is_symlink() or not TARGET.is_file():
        raise SystemExit('Expected a regular Roya domain configuration file.')
    original = TARGET.read_text()
    try:
        updated, count = rewrite(original)
    except ValueError as error:
        raise SystemExit(str(error))
    print(f'Found {count} public noindex header directive(s) in {TARGET}.')
    if '--apply' not in sys.argv:
        print('Dry run: no changes made. Run as root with --apply to enable public indexing.')
        return
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo python3 and --apply.')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup_dir = Path('/var/backups/roya-config')
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = backup_dir / f'roya-domain-before-public-seo-{stamp}.conf'
    shutil.copy2(TARGET, backup)
    backup.chmod(0o600)
    try:
        TARGET.write_text(updated)
        subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        verify_public_headers()
    except Exception as error:
        TARGET.write_text(original)
        subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise SystemExit(f'Previous configuration restored: {error}')
    print(f'Configuration backup: {backup}')
    print('Public noindex header removed; Nginx validation and HTTPS header checks passed.')


if __name__ == '__main__':
    main()

