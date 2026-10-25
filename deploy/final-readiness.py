#!/usr/bin/env python3
"""Read-only Roya VPS snapshot. No writes, login, reload, payment or SMS."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import http.client
import json
import os
import re
import shutil
import socket
import ssl
import subprocess

DOMAIN = 'royahealthyfood.ir'
KNOWN_RELEASES = {
    '321f8929648c9fcf2bdcfda3e270352b0b9d2174': 'operator-confirmed baseline',
    'a0b38ea170bc2506804a865e46bf1c7e0506037e': 'prepared tracking preview',
}


def command(*args):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=12, check=False)
        return p.returncode, p.stdout
    except (OSError, subprocess.TimeoutExpired):
        return None, ''


class LocalHTTPS(http.client.HTTPSConnection):
    def connect(self):
        raw = socket.create_connection(('127.0.0.1', 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=DOMAIN)
        except BaseException:
            raw.close()
            raise


def request(path, timeout=8):
    connection = LocalHTTPS(DOMAIN, timeout=timeout, context=ssl.create_default_context())
    try:
        connection.connect()
        certificate = connection.sock.getpeercert()
        connection.request('GET', path, headers={'Host': DOMAIN, 'Connection': 'close'})
        response = connection.getresponse()
        data = response.read(600001)
        result = {'status': response.status,
                  'noindex': 'noindex' in (response.getheader('X-Robots-Tag') or '').lower(),
                  'noStore': 'no-store' in (response.getheader('Cache-Control') or '').lower(),
                  'stage': response.getheader('X-Roya-Domain-Stage'),
                  'trustedCertificate': True}
        if len(data) > 600000:
            result['bodyTooLarge'] = True
            return result, None, certificate
        if path.startswith('/api/shop/') and response.status in (200, 503):
            try:
                data = json.loads(data)
            except (ValueError, UnicodeError):
                data = None
        else:
            data = None  # Never print HTML, account/error bodies or cookies.
        return result, data, certificate
    except Exception as error:
        return {'status': None, 'errorType': type(error).__name__}, None, None
    finally:
        connection.close()


def backup_snapshot(now):
    receipt = Path('/var/lib/roya/admin-backup-receipt.json')
    if not receipt.is_file() or receipt.is_symlink():
        return {'receiptPresent': False, 'freshVerifiedBackupRequired': True}
    try:
        if receipt.stat().st_size > 64000:
            raise ValueError('receipt size')
        item = json.loads(receipt.read_text())
        directory = Path(item.get('directory', ''))
        if (directory.parent != Path('/var/backups/roya') or directory.is_symlink()
                or directory.resolve() != directory or not directory.is_dir()):
            raise ValueError('backup path')
        created = datetime.fromisoformat(item['createdAt'])
        if created.tzinfo is None:
            raise ValueError('backup date')
        age = (now - created).total_seconds() / 3600
        verified = item.get('restoreVerified') is True and item.get('database') == 'roya_store'
        hashes = {}
        for filename, key in (('database.dump', 'dumpSha256'),
                              ('configuration.tar.gz', 'configurationSha256')):
            path = directory / filename
            if (path.is_symlink() or not path.is_file() or path.resolve() != path
                    or not re.fullmatch('[a-f0-9]{64}', str(item.get(key, '')))):
                hashes[filename] = False
            elif path.stat().st_size <= 256 * 1024 * 1024:
                with path.open('rb') as source:
                    hashes[filename] = hashlib.file_digest(source, 'sha256').hexdigest() == item[key]
            else:
                hashes[filename] = None  # Bound snapshot I/O; do not imply verification.
        return {'receiptPresent': True, 'directory': str(directory),
                'createdAt': created.isoformat(), 'ageHours': round(age, 1),
                'receiptRelease': item.get('release') if item.get('release') in KNOWN_RELEASES else 'other',
                'isolatedRestoreRecorded': verified, 'hashMatches': hashes,
                'freshVerifiedBackupRequired': not (verified and 0 <= age <= 24 and all(v is True for v in hashes.values())),
                'newBackupOrRestoreRun': False, 'offsiteCopyVerified': False}
    except Exception:
        return {'receiptPresent': True, 'receiptUsable': False,
                'freshVerifiedBackupRequired': True}


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo python3 on the Roya VPS; no password or API key is requested.')
    if not Path('/home/amir/roya-setup').is_dir():
        raise SystemExit('STOP: expected Roya host paths are missing; nothing changed.')
    now = datetime.now(timezone.utc)
    marker = Path('/opt/roya/preview-current/.roya-release')
    release = marker.read_text().strip()
    if release not in KNOWN_RELEASES:
        raise SystemExit('STOP: installed release is outside this snapshot tool; nothing changed.')
    env = Path('/etc/roya/preview.env')
    if not env.is_file() or env.is_symlink() or env.stat().st_size > 64000:
        raise SystemExit('STOP: unexpected preview configuration; nothing changed.')
    values = dict(line.split('=', 1) for line in env.read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    expected = {'HOSTNAME': '127.0.0.1', 'PORT': '3311', 'ROYA_DEPLOYMENT_ROLE': 'standalone',
                'ROYA_INDEXABLE': '0', 'ROYA_LIVE_PAYMENTS': '0', 'ROYA_ACCEPT_ORDERS': '0',
                'ROYA_SEND_SMS': '0', 'NEXTAUTH_URL': 'https://' + DOMAIN,
                'NEXT_PUBLIC_SITE_URL': 'https://' + DOMAIN}
    report = {'checkedAt': now.isoformat(), 'domain': DOMAIN, 'readOnly': True,
              'release': release, 'releaseDescription': KNOWN_RELEASES[release],
              'configurationMatches': {k: values.get(k) == v for k, v in expected.items()}}
    report['services'] = {}
    for unit in ('roya-preview.service', 'nginx.service', 'roya-store.service'):
        code, state = command('systemctl', 'is-active', unit)
        enabled, _ = command('systemctl', 'is-enabled', unit)
        report['services'][unit] = {'active': code == 0, 'enabled': enabled == 0}
    code, _ = command('nginx', '-t')
    report['nginxSyntaxValid'] = code == 0
    code, listeners = command('ss', '-lntH', '( sport = :3311 )')
    rows = [line.split() for line in listeners.splitlines() if line.strip()]
    report['loopbackOnly'] = code == 0 and bool(rows) and all(len(row) > 3 and row[3] == '127.0.0.1:3311' for row in rows)
    report['freeDiskMiB'] = shutil.disk_usage('/').free // (1024 * 1024)
    memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    report['availableMemoryMiB'] = int(memory.get('MemAvailable', '0 kB').split()[0]) // 1024
    code, timers = command('systemctl', 'list-unit-files', '--type=timer', '--no-pager', '--no-legend')
    report['relatedTimerUnitFiles'] = [{'unit': row[0], 'state': row[1]} for line in timers.splitlines()
        if len(row := line.split()) > 1 and ('certbot' in row[0] or ('roya' in row[0] and 'backup' in row[0]))]
    report['certbotCronFilePresent'] = Path('/etc/cron.d/certbot').is_file()
    report['nginxLogrotateFilePresent'] = Path('/etc/logrotate.d/nginx').is_file()
    report['backup'] = backup_snapshot(now)
    report['https'] = {}
    for path in ('/api/health/', '/fa/catalog/', '/api/admin/data/?section=settings', '/api/shop/rates/'):
        result, data, certificate = request(path, timeout=15 if path.endswith('/rates/') else 8)
        report['https'][path] = result
        if certificate and 'certificate' not in report:
            report['certificate'] = {'trusted': True, 'notAfter': certificate.get('notAfter')}
        if path.endswith('/rates/') and isinstance(data, dict):
            sources = data.get('sources', {})
            report['rates'] = {'sources': {key: {field: source.get(field) for field in ('state', 'fetchedAt', 'refreshFailed')}
                for key in ('nobitex', 'fx') if isinstance(source := sources.get(key), dict)},
                'provider': (data.get('fx') or {}).get('fxMeta', {}).get('provider'),
                'dataDate': (data.get('fx') or {}).get('fxMeta', {}).get('date')}
    report['snapshotStableRelease'] = marker.read_text().strip() == release
    report['scope'] = 'Local Nginx/Host/SNI snapshot, not external browser, scheduled-backup execution, offsite restore or long-term stability proof.'
    report['changes'] = 'None. No deployment, DNS, certificate request, reload/restart, backup/restore, login, order, payment or SMS.'
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
