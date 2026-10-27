#!/usr/bin/env python3
"""Bounded read-only maintenance metadata. Never prints logs, environment or command lines."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import re
import subprocess

RELEASE = '22ce6679b45e2a32ee347999b1b98a1b1687ad07'
PROPERTIES = ('ActiveState', 'SubState', 'UnitFileState', 'Result', 'ExecMainStatus',
              'ExecMainStartTimestamp', 'ExecMainExitTimestamp', 'LastTriggerUSec',
              'NextElapseUSecRealtime', 'NRestarts', 'ActiveEnterTimestamp')


def command(*args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=10, check=False)
        return result.stdout if result.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired):
        return ''


def properties(text):
    return {key: value for line in text.splitlines() if '=' in line
            for key, value in [line.split('=', 1)] if key in PROPERTIES}


def timer_names(text):
    return sorted({line.split()[0] for line in text.splitlines() if line.split()
                   and re.fullmatch(r'[A-Za-z0-9_.@-]+\.timer', line.split()[0])
                   and re.search(r'roya|certbot|backup|logrotate', line.split()[0], re.I)})


def rotation_policy(text):
    # Deliberately omit paths, scripts and raw file contents.
    tokens = set(re.findall(r'^\s*(daily|weekly|monthly|compress|delaycompress|missingok|notifempty)\s*$', text, re.M))
    counts = re.findall(r'^\s*rotate\s+(\d+)\s*$', text, re.M)
    return {'directives': sorted(tokens), 'retainedRotations': [int(n) for n in counts]}


def read(path, limit=262144):
    try:
        with Path(path).open('rb') as stream:
            value = stream.read(limit + 1)
        return value.decode('utf-8') if len(value) <= limit else ''
    except (OSError, UnicodeError):
        return ''


def main():
    if os.geteuid() != 0 or os.environ.get('SUDO_USER') != 'amir':
        raise SystemExit('Use sudo from the amir session on the Roya VPS.')
    if read('/opt/roya/preview-current/.roya-release').strip() != RELEASE:
        raise SystemExit('Installed release differs; no maintenance changes were made.')
    before = Path('/opt/roya/preview-current').resolve()
    names = timer_names(command('systemctl', 'list-unit-files', '--type=timer', '--no-legend', '--no-pager'))
    units = {}
    for name in ['roya-preview.service', 'nginx.service'] + names + [n[:-6] + '.service' for n in names]:
        units[name] = properties(command('systemctl', 'show', name, '--no-pager', '--property=' + ','.join(PROPERTIES)))
    cron = read('/etc/cron.d/certbot')
    result = {
        'checkedAt': datetime.now(timezone.utc).isoformat(), 'readOnly': True, 'release': RELEASE,
        'units': units,
        'royaNamedBackupTimerPresent': any('roya' in n.lower() and 'backup' in n.lower() for n in names),
        'certbotCronFilePresent': Path('/etc/cron.d/certbot').is_file(),
        'certbotCronHasNoncommentCommand': any('certbot' in line and not line.lstrip().startswith('#') for line in cron.splitlines()),
        'nginxLogRotation': rotation_policy(read('/etc/logrotate.d/nginx')),
        'journalDiskUsage': command('journalctl', '--disk-usage').strip(),
        'scheduledBackupExecutionVerified': False, 'offsiteCopyVerified': False,
        'scope': 'Timer/service metadata only. A timer trigger or success result alone does not prove a verified backup, certificate renewal, isolated restore or retention execution.',
        'changes': 'None. No login, deployment, backup/restore, timer change, cleanup, reload, certificate request, order, payment or SMS.'}
    if Path('/opt/roya/preview-current').resolve() != before or read('/opt/roya/preview-current/.roya-release').strip() != RELEASE:
        raise SystemExit('Release changed during inspection; repeat from a stable version.')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
