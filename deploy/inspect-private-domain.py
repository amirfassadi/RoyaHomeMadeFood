#!/usr/bin/env python3
"""Read-only VPS readiness report; never print environment values or full configs."""
from pathlib import Path
import json
import os
import re
import shutil
import subprocess

EXPECTED_RELEASE = '4497131e733c07627316685e3b91e7a62af75627'
DOMAIN = 'royahealthyfood.ir'


def run(args, timeout=10):
    try:
        result = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True,
                                text=True, timeout=timeout, check=False)
        return result.returncode, result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return None, ''


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo python3 in the Roya VPS terminal.')
    os.environ['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin'
    marker = Path('/opt/roya/preview-current/.roya-release')
    if not marker.is_file() or marker.read_text().strip() != EXPECTED_RELEASE:
        raise SystemExit('STOP: installed private preview release differs; no changes made.')

    report = {'domain': DOMAIN, 'release': EXPECTED_RELEASE, 'readOnly': True}
    report['services'] = {}
    for service in ('roya-preview.service', 'roya-store.service', 'nginx.service'):
        active, _ = run(['systemctl', 'is-active', '--quiet', service])
        enabled, _ = run(['systemctl', 'is-enabled', '--quiet', service])
        report['services'][service] = {'active': active == 0, 'enabled': enabled == 0}

    # Output only comparisons with known non-secret settings, never file content.
    settings = dict(line.split('=', 1) for line in Path('/etc/roya/preview.env').read_text().splitlines()
                    if '=' in line and not line.startswith('#'))
    expected = {'HOSTNAME': '127.0.0.1', 'PORT': '3311', 'ROYA_DEPLOYMENT_ROLE': 'standalone',
                'ROYA_PRIVATE_DB_CATALOG': '1', 'ROYA_DEMO_CATALOG': '1',
                'ROYA_INDEXABLE': '0', 'ROYA_LIVE_PAYMENTS': '0', 'ROYA_ACCEPT_ORDERS': '0',
                'ROYA_SEND_SMS': '0', 'ROYA_TRUST_GEO_HEADER': '0',
                'NEXTAUTH_URL': 'http://localhost:3311', 'NEXT_PUBLIC_SITE_URL': 'http://localhost:3311'}
    report['privateSettingsMatch'] = {key: settings.get(key) == value for key, value in expected.items()}

    tools = ('nginx', 'named', 'named-checkconf', 'named-checkzone', 'dig', 'htpasswd')
    report['tools'] = {name: shutil.which(name) is not None for name in tools}
    report['certbot'] = any(Path(name).is_file() for name in ('/snap/bin/certbot', '/usr/bin/certbot'))

    code, config = run(['nginx', '-T'])
    report['nginx'] = {'configurationValid': code == 0}
    if code == 0:
        report['nginx']['siteMappings'] = re.findall(r'^\s*((?:server_name|listen)\s+[^;]+;)', config, re.M)
        names = re.findall(r'^\s*server_name\s+([^;]+);', config, re.M)
        report['nginx']['domainAlreadyConfigured'] = any(DOMAIN in value.split() or 'www.' + DOMAIN in value.split()
                                                        for value in names)
    del config

    # Identify custom BIND config/chroot from the running process without exposing argv.
    processes = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if (entry / 'comm').read_text().strip() != 'named':
                continue
            argv = (entry / 'cmdline').read_bytes().decode(errors='replace').split('\0')
            def option(name, default=None):
                return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default
            processes.append({'config': option('-c', '/etc/bind/named.conf'), 'chroot': option('-t')})
        except (OSError, ProcessLookupError):
            continue
    report['dns'] = {'runningProcesses': processes}
    if len(processes) == 1 and report['tools']['named-checkconf']:
        active = processes[0]
        args = ['named-checkconf', '-p']
        if active['chroot']:
            args += ['-t', active['chroot']]
        args.append(active['config'])
        code, config = run(args)
        report['dns']['configurationValid'] = code == 0
        if code == 0:
            # TSIG secrets and all other configuration text remain local and are discarded.
            report['dns']['zones'] = sorted(set(re.findall(r'^\s*zone\s+"([^"\n]+)"', config, re.M)))
            report['dns']['views'] = re.findall(r'^\s*view\s+"([^"\n]+)"', config, re.M)
            config_path = Path(active['config'])
            if active['chroot']:
                config_path = Path(active['chroot']) / active['config'].lstrip('/')
            if config_path.is_file():
                report['dns']['includes'] = re.findall(r'\binclude\s+"([^"\n]+)"\s*;', config_path.read_text())
        del config

    code, sockets = run(['ss', '-H', '-lntup', '( sport = :53 or sport = :80 or sport = :443 or sport = :3311 or sport = :3312 )'])
    report['listeners'] = sockets.splitlines() if code == 0 else []
    memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    report['availableMemoryMiB'] = int(memory['MemAvailable'].split()[0]) // 1024
    report['freeDiskMiB'] = shutil.disk_usage('/opt/roya').free // (1024 * 1024)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print('DOMAIN READINESS REPORT COMPLETE: no configuration, DNS, service or database changed.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit('READINESS STOPPED: ' + type(error).__name__ + '; no configuration values printed.')
