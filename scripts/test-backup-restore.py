"""Run the production dump/restore core against GitHub's isolated PG container."""
from pathlib import Path
import importlib.util
import json
import os
import re
import subprocess
import tempfile

container = os.environ['ROYA_TEST_PG_CONTAINER']
if not re.fullmatch('[a-f0-9]{64}', container):
    raise SystemExit('Isolated PostgreSQL container ID required.')
spec = importlib.util.spec_from_file_location('roya_backup', Path(__file__).resolve().parents[1] / 'deploy/backup-before-admin.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
def pg(name, *args):
    return ['docker', 'exec', '-i', container, name, '-U', 'roya_test', *args]
with tempfile.TemporaryDirectory(prefix='roya-backup-integration.') as directory:
    result = module.verified_database_backup(pg, 'roya_test', directory)
    assert result['restoreVerified'] and result['tables'] > 0
    count = subprocess.check_output(pg('psql', '-X', '-qAt', '-d', 'roya_test', '-c', "SELECT count(*) FROM pg_database WHERE datname LIKE 'roya_restore_test_%'"), text=True).strip()
    assert count == '0', 'Restore test database must be removed.'
    print('BACKUP INTEGRATION PASS: consistent dump, isolated restore, matching table counts, test database removed.')
