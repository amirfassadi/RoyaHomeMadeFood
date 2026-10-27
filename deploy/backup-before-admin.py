#!/usr/bin/env python3
"""Private backup plus isolated restore verification before administrator writes."""
from pathlib import Path
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
import pwd
import re
import shutil
import stat
import subprocess
import tarfile
import uuid
from urllib.parse import urlparse

def file_sha256(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

COUNTS_SQL = """
SELECT format('SELECT %L, count(*) FROM %I.%I', tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\\gexec
SELECT '__ROYA_COUNTS_END__';
"""

def read_counts(stream):
    rows = {}
    for line in stream:
        value = line.rstrip('\n')
        if value == '__ROYA_COUNTS_END__':
            return rows
        name, count = value.split('\t')
        rows[name] = int(count)
    raise RuntimeError('Database snapshot did not return complete counts.')

def verified_database_backup(pg, database, destination):
    if database not in ('roya_store', 'roya_test', 'roya_integration_test'):
        raise RuntimeError('Unexpected backup database.')
    destination = Path(destination)
    archive = destination / 'database.dump'
    session = subprocess.Popen(pg('psql', '-X', '-qAt', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-d', database),
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        session.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL statement_timeout='30s';\nSELECT pg_export_snapshot();\n")
        session.stdin.flush()
        snapshot = session.stdout.readline().strip()
        if not re.fullmatch(r'[0-9A-Fa-f]+-[0-9A-Fa-f]+-\d+', snapshot):
            raise RuntimeError('Could not export a database snapshot.')
        with archive.open('xb') as output:
            subprocess.run(pg('pg_dump', '--format=custom', '--no-owner', '--no-acl', '--snapshot=' + snapshot, database),
                           stdout=output, check=True, timeout=600)
        session.stdin.write(COUNTS_SQL)
        session.stdin.flush()
        counts = read_counts(session.stdout)
        session.stdin.write('COMMIT;\n')
        session.stdin.close()
        if session.wait(timeout=30) != 0:
            raise RuntimeError('Snapshot session failed.')
    finally:
        if session.poll() is None:
            session.terminate()
            session.wait(timeout=10)
    if not counts:
        raise RuntimeError('No application tables found.')
    (destination / 'snapshot-counts.json').write_text(json.dumps(counts, sort_keys=True, indent=2) + '\n')
    restore_database = 'roya_restore_test_' + uuid.uuid4().hex[:16]
    created = False
    try:
        subprocess.run(pg('createdb', '--template=template0', restore_database), check=True, timeout=30)
        created = True
        with archive.open('rb') as source:
            subprocess.run(pg('pg_restore', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname=' + restore_database),
                           stdin=source, check=True, timeout=600)
        result = subprocess.run(pg('psql', '-X', '-qAt', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-d', restore_database),
                                input=COUNTS_SQL, capture_output=True, text=True, check=True, timeout=60)
        import io
        if read_counts(io.StringIO(result.stdout)) != counts:
            raise RuntimeError('Restored table counts differ from the exported snapshot.')
    finally:
        if created:
            subprocess.run(pg('dropdb', restore_database), check=True, timeout=30)
    return {'restoreVerified': True, 'tables': len(counts), 'dumpSha256': file_sha256(archive)}

def main():
    if os.geteuid() != 0:
        raise SystemExit('Run this backup with sudo python3; no application credentials are requested.')
    os.umask(0o077)
    lock_path = '/home/amir/roya-setup/deploy.lock'
    lock = os.open(lock_path, os.O_RDWR | os.O_NOFOLLOW)
    if not stat.S_ISREG(os.fstat(lock).st_mode) or os.fstat(lock).st_uid != pwd.getpwnam('amir').pw_uid:
        raise SystemExit('STOP: unexpected Roya deployment lock.')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    current = Path('/opt/roya/preview-current/.roya-release').read_text().strip()
    if not re.fullmatch('[a-f0-9]{40}', current):
        raise SystemExit('STOP: invalid installed release.')
    subprocess.run(['systemctl', 'is-active', '--quiet', 'roya-preview.service'], check=True)
    preview = Path('/etc/roya/preview.env')
    values = dict(line.split('=', 1) for line in preview.read_text().splitlines() if '=' in line and not line.startswith('#'))
    database_env = Path('/etc/roya/database.env')
    database_values = dict(line.split('=', 1) for line in database_env.read_text().splitlines() if '=' in line and not line.startswith('#'))
    for key in ('DATABASE_URL', 'DIRECT_URL'):
        target = urlparse(values.get(key, database_values.get(key, '')))
        if (target.scheme, target.hostname, target.port, target.path, target.username) != ('postgresql', '127.0.0.1', 5432, '/roya_store', 'roya_app') or not target.password:
            raise SystemExit('STOP: preview database target differs from the backup database.')
    for key, expected in {'HOSTNAME': '127.0.0.1', 'PORT': '3311', 'ROYA_INDEXABLE': '0', 'ROYA_LIVE_PAYMENTS': '0', 'ROYA_ACCEPT_ORDERS': '0', 'ROYA_SEND_SMS': '0'}.items():
        if values.get(key) != expected:
            raise SystemExit('STOP: private preview configuration differs.')
    listeners = subprocess.check_output(['ss', '-lntH', '( sport = :3311 )'], text=True).splitlines()
    if not listeners or any(line.split()[3] != '127.0.0.1:3311' for line in listeners):
        raise SystemExit('STOP: private preview listener differs.')
    binaries = Path('/usr/lib/postgresql/18/bin')
    if not all((binaries / name).is_file() for name in ('psql', 'pg_dump', 'pg_restore', 'createdb', 'dropdb')):
        raise SystemExit('STOP: PostgreSQL 18 backup tools are missing.')
    def pg(name, *args):
        return ['runuser', '-u', 'postgres', '--', str(binaries / name), '-U', 'postgres', *args]
    size = int(subprocess.check_output(pg('psql', '-X', '-qAt', '-d', 'roya_store', '-c', "SELECT pg_database_size(current_database())"), text=True).strip())
    root = Path('/var/backups/roya')
    if root.is_symlink() or (root.exists() and root.stat().st_uid != 0):
        raise SystemExit('STOP: unexpected backup directory.')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    if shutil.disk_usage(root).free < 3 * size + 100 * 1024 * 1024:
        raise SystemExit('STOP: insufficient space for backup and isolated restore.')
    destination = root / ('pre-admin-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    destination.mkdir(mode=0o700)
    files = ['/etc/roya/database.env', '/etc/roya/backend.env', '/etc/roya/preview.env',
             '/etc/systemd/system/roya-preview.service', '/etc/systemd/system/roya-store.service', '/etc/nginx/conf.d/roya-api.conf']
    with tarfile.open(destination / 'configuration.tar.gz', 'w:gz') as archive:
        for name in files:
            path = Path(name)
            if path.is_symlink() or not path.is_file():
                raise SystemExit('STOP: expected Roya configuration missing.')
            archive.add(path, arcname=name.lstrip('/'), recursive=False)
    result = verified_database_backup(pg, 'roya_store', destination)
    result.update({'database': 'roya_store', 'release': current, 'createdAt': datetime.now(timezone.utc).isoformat(),
                   'previewEnvSha256': file_sha256(preview),
                   'databaseEnvSha256': file_sha256(database_env),
                   'directory': str(destination), 'configurationSha256': hashlib.sha256((destination / 'configuration.tar.gz').read_bytes()).hexdigest()})
    (destination / 'verification.json').write_text(json.dumps(result, sort_keys=True, indent=2) + '\n')
    receipt = Path('/var/lib/roya/admin-backup-receipt.json')
    receipt.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    stage = receipt.with_name('.admin-backup-' + uuid.uuid4().hex + '.json')
    stage.write_text(json.dumps(result, sort_keys=True) + '\n')
    stage.chmod(0o600)
    os.replace(stage, receipt)
    print('BACKUP_RESTORE_VERIFIED: ' + str(destination))
    print('Live database and administrator account preserved; isolated restore database removed.')

if __name__ == '__main__':
    main()
