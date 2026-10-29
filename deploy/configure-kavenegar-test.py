#!/usr/bin/env python3
"""Configure an approved Kavenegar template privately; sends no SMS."""
from datetime import datetime, timezone
from getpass import getpass
import os
from pathlib import Path
import re
import secrets
import shutil
import tempfile
import json
from urllib.request import urlopen


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo python3.')
    paths = [Path('/etc/roya/backend.vps.env'), Path('/etc/roya/preview.vps.env')]
    for path in paths:
        if path.is_symlink() or not path.is_file() or path.stat().st_uid != 0:
            raise SystemExit('Expected existing root-owned regular environment files.')
    # Do not enable account SMS on a legacy release without the five-send cap.
    try:
        for port in (3310, 3311):
            with urlopen(f'http://127.0.0.1:{port}/api/shop/mobile/code/', timeout=5) as response:
                if not isinstance(json.load(response).get('enabled'), bool):
                    raise ValueError()
    except Exception:
        raise SystemExit('Deploy the guest-verification release on both services first. Files unchanged.')
    key = getpass('KAVENEGAR_API_KEY (hidden): ').strip()
    template = getpass('Approved template name (hidden): ').strip()
    digits = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
    phones = [re.sub(r'[\s-]', '', p.translate(digits)) for p in getpass('Allowed test mobiles, comma-separated (hidden): ').split(',')]
    if not re.fullmatch(r'[A-Za-z0-9]{16,256}', key) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', template):
        raise SystemExit('Invalid key or template name. Files unchanged.')
    if not 1 <= len(phones) <= 5 or not all(re.fullmatch(r'09\d{9}', p) for p in phones):
        raise SystemExit('Enter 1-5 Iranian mobiles in 09xxxxxxxxx format. Files unchanged.')
    original = {p: p.read_text() for p in paths}
    otp_secret = secrets.token_urlsafe(48)
    for text in original.values():
        match = re.search(r'^CUSTOMER_OTP_SECRET=([A-Za-z0-9_-]{32,})\s*$', text, re.M)
        if match:
            otp_secret = match.group(1)
            break
    values = {'KAVENEGAR_API_KEY': key, 'KAVENEGAR_OTP_TEMPLATE': template,
              'CUSTOMER_OTP_SECRET': otp_secret, 'CUSTOMER_ACCOUNTS_ENABLED': '1',
              'ROYA_SMS_MODE': 'test', 'ROYA_SMS_TEST_MOBILES': ','.join(dict.fromkeys(phones))}
    backup = Path('/var/backups/roya-config') / ('before-kavenegar-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(mode=0o700, parents=True)
    for path in paths:
        shutil.copy2(path, backup / path.name)
        (backup / path.name).chmod(0o600)
    try:
        for path, text in original.items():
            for name, value in values.items():
                text, count = re.subn(r'^' + name + r'=.*$', lambda _: name + '=' + value, text, flags=re.M)
                if not count:
                    text = text.rstrip('\n') + '\n' + name + '=' + value + '\n'
            fd, temporary = tempfile.mkstemp(prefix='.sms-config-', dir=path.parent)
            try:
                with os.fdopen(fd, 'w') as handle:
                    handle.write(text)
                os.chmod(temporary, 0o600)
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
    except Exception:
        for path, text in original.items():
            path.write_text(text)
            path.chmod(0o600)
        raise SystemExit('Configuration failed; previous files restored.')
    print('Configured test-only recipients and shared five-attempt SMS budget policy.')
    print('No SMS was sent. Persistent budget was not reset. Services were not restarted.')
    print('Private configuration backup:', backup)


if __name__ == '__main__':
    main()
