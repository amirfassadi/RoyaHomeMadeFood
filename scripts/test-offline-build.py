#!/usr/bin/env python3
"""Offline integrity boundaries, plus an isolated cache/install/build/HTTP story."""
from pathlib import Path
from tempfile import TemporaryDirectory
import base64
import hashlib
import importlib.util
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


inputs = load('offline_inputs', ROOT / 'deploy/offline-build-inputs.py')
cache_inspection = load('offline_inventory', ROOT / 'deploy/inspect-offline-cache.py')
MISSING = {'node_modules/@emnapi/runtime', 'node_modules/@img/sharp-wasm32', 'node_modules/fast-uri'}


def run(arguments, *, cwd=None, env=None):
    subprocess.run(arguments, cwd=cwd, env=env, check=True, timeout=240)


class Integrity(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix='roya-offline-inputs-')
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.candidate = self.home / 'roya-setup/domain-source.test'
        self.candidate.mkdir(parents=True)
        self.source = self.home / 'source'
        (self.source / 'deploy/vendor').mkdir(parents=True)
        for directory in (self.source, self.candidate):
            shutil.copyfile(ROOT / 'package-lock.json', directory / 'package-lock.json')
        shutil.copyfile(ROOT / 'deploy/vendor/fast-uri-3.1.9.tgz', self.source / 'deploy/vendor/fast-uri-3.1.9.tgz')
        self.engine = self.home / '.cache/prisma/master' / inputs.ENGINE_VERSION / 'debian-openssl-3.0.x/schema-engine'
        self.engine.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / 'node_modules/@prisma/engines' / inputs.ENGINE_FILE, self.engine)

    def test_valid_inputs_restore_only_into_candidate(self):
        target = self.candidate / 'node_modules/@prisma/engines'
        target.mkdir(parents=True)
        inputs.restore_engine(self.source, self.candidate, self.home)
        self.assertEqual(hashlib.sha256((target / inputs.ENGINE_FILE).read_bytes()).hexdigest(), inputs.ENGINE_SHA256)
        self.assertEqual(hashlib.sha256(self.engine.read_bytes()).hexdigest(), inputs.ENGINE_SHA256)

    def test_tampered_tarball_is_refused(self):
        (self.source / 'deploy/vendor/fast-uri-3.1.9.tgz').write_bytes(b'tampered')
        with self.assertRaisesRegex(RuntimeError, 'package differs'):
            inputs.verified_inputs(self.source, self.candidate, self.home)

    def test_tampered_engine_and_lock_are_refused(self):
        self.engine.write_bytes(b'tampered')
        with self.assertRaisesRegex(RuntimeError, 'engine differs'):
            inputs.verified_inputs(self.source, self.candidate, self.home)
        (self.candidate / 'package-lock.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'package-lock differs'):
            inputs.verified_inputs(self.source, self.candidate, self.home)

    def test_engine_target_cannot_escape_candidate(self):
        (self.candidate / 'node_modules/@prisma').mkdir(parents=True)
        outside = self.home / 'outside'
        outside.mkdir()
        (self.candidate / 'node_modules/@prisma/engines').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'dependency was not installed'):
            inputs.restore_engine(self.source, self.candidate, self.home)
        self.assertEqual(list(outside.iterdir()), [])

    def test_vendor_seeds_a_real_empty_offline_npm_cache(self):
        cache = self.home / '.npm'
        project = self.home / 'single-package'
        project.mkdir()
        package = {'name': 'roya-offline-fixture', 'version': '1.0.0', 'dependencies': {'fast-uri': '3.1.9'}}
        entry = json.loads((ROOT / 'package-lock.json').read_text())['packages']['node_modules/fast-uri']
        (project / 'package.json').write_text(json.dumps(package))
        (project / 'package-lock.json').write_text(json.dumps({'name': package['name'], 'version': '1.0.0',
            'lockfileVersion': 3, 'packages': {'': package, 'node_modules/fast-uri': entry}}))
        run(['npm', 'cache', 'add', str(self.source / 'deploy/vendor/fast-uri-3.1.9.tgz'),
             '--offline', '--ignore-scripts', '--cache', str(cache), '--no-audit', '--no-fund'])
        run(['npm', 'ci', '--offline', '--ignore-scripts', '--cache', str(cache), '--no-audit', '--no-fund'], cwd=project)
        self.assertEqual(json.loads((project / 'node_modules/fast-uri/package.json').read_text())['version'], '3.1.9')


def integration():
    original_cache = Path(subprocess.check_output(['npm', 'config', 'get', 'cache'], text=True).strip())
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    with TemporaryDirectory(prefix='roya-offline-story-') as temporary:
        home = Path(temporary)
        candidate = home / 'roya-setup/domain-source.offline-test'
        candidate.mkdir(parents=True)
        preparation = (ROOT / 'deploy/upgrade-private-domain.sh').read_text().split("<<'PREPARE'\n", 1)[1].split('\nPREPARE', 1)[0]
        subprocess.run(['python3', '-', str(ROOT), str(candidate)], input=preparation, text=True, check=True)
        cache = home / '.npm'
        for name, item in lock['packages'].items():
            if not name or name in MISSING or 'integrity' not in item:
                continue
            if not all(cache_inspection.allows(value, item.get(key)) for key, value in
                       (('os', 'linux'), ('cpu', 'x64'), ('libc', 'glibc'))):
                continue
            digest = base64.b64decode(item['integrity'][7:]).hex()
            relative = Path('_cacache/content-v2/sha512') / digest[:2] / digest[2:4] / digest[4:]
            source = original_cache / relative
            if not source.is_file():
                raise RuntimeError('CI cache is missing an additional dependency: ' + name)
            destination = cache / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists():
                shutil.copyfile(source, destination)
        engine = home / '.cache/prisma/master' / inputs.ENGINE_VERSION / 'debian-openssl-3.0.x/schema-engine'
        engine.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / 'node_modules/@prisma/engines' / inputs.ENGINE_FILE, engine)
        before = cache_inspection.inventory(lock, cache, home)
        expected_missing = {name + '@' + lock['packages'][name]['version'] for name in MISSING}
        if before['verifiedTarballs'] != 251 or set(before['missing']) != expected_missing or before['corruptCount']:
            raise RuntimeError('Offline fixture does not reproduce the 251-good/3-missing VPS snapshot.')
        inputs.verified_inputs(ROOT, candidate, home)
        run(['npm', 'cache', 'add', str(ROOT / 'deploy/vendor/fast-uri-3.1.9.tgz'), '--offline',
             '--ignore-scripts', '--cache', str(cache), '--no-audit', '--no-fund'])
        run(['npm', 'ci', '--offline', '--ignore-scripts', '--include=dev', '--cache', str(cache), '--no-audit', '--no-fund'], cwd=candidate)
        target = inputs.restore_engine(ROOT, candidate, home)
        for name in ('@emnapi/runtime', '@img/sharp-wasm32'):
            if (candidate / 'node_modules' / name).exists():
                raise RuntimeError('Optional WASM dependency unexpectedly available; fixture did not exercise its absence.')
        env = dict(os.environ)
        for name in ('DATABASE_URL', 'DIRECT_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL_INTERNAL', 'ROYA_BACKEND_URL', 'SITES_STATIC_PREVIEW'):
            env.pop(name, None)
        env.update({'PRISMA_SCHEMA_ENGINE_BINARY': str(target), 'PRISMA_ENGINES_MIRROR': 'http://127.0.0.1:9',
            'NEXT_TELEMETRY_DISABLED': '1', 'ROYA_DEPLOYMENT_ROLE': 'standalone', 'ROYA_DEMO_CATALOG': '1',
            'ROYA_PRIVATE_DB_CATALOG': '1', 'ROYA_INDEXABLE': '0', 'ROYA_LIVE_PAYMENTS': '0',
            'ROYA_ACCEPT_ORDERS': '0', 'ROYA_SEND_SMS': '0', 'NEXTAUTH_URL': 'https://royahealthyfood.ir',
            'NEXT_PUBLIC_SITE_URL': 'https://royahealthyfood.ir', 'NODE_OPTIONS': '--max-old-space-size=1536'})
        run(['node', str(ROOT / 'deploy/check-offline-native.mjs')], cwd=candidate, env=env)
        run(['npm', 'test'], cwd=candidate, env=env)
        run(['npm', 'run', 'build:app'], cwd=candidate, env=env)
        stage = candidate / '.roya-domain-stage'
        shutil.copytree(candidate / '.next/standalone', stage)
        shutil.copytree(candidate / 'public', stage / 'public')
        shutil.copytree(candidate / '.next/static', stage / '.next/static')
        shutil.copyfile(candidate / '.roya-origin.json', stage / '.roya-origin.json')
        env.update({'DATABASE_URL': os.environ['ROYA_INTEGRATION_DATABASE_URL'],
                    'DIRECT_URL': os.environ['ROYA_INTEGRATION_DATABASE_URL'],
                    'NEXTAUTH_SECRET': 'offline_ci_fixture_only_never_a_real_deployment_secret', 'HOSTNAME': '127.0.0.1'})
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            port = reservation.getsockname()[1]
        env['PORT'] = str(port)
        domain = load('offline_domain_check', ROOT / 'deploy/connect-private-domain.py')
        with (home / 'server.log').open('w+') as output:
            server = subprocess.Popen(['node', str(stage / 'server.js')], cwd=stage, env=env, stdout=output, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 30
                while True:
                    if server.poll() is not None:
                        raise RuntimeError('Offline candidate stopped during startup.')
                    try:
                        if domain.request('/api/health/', port=port).status == 200:
                            break
                    except OSError:
                        pass
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Offline candidate health timeout.')
                    time.sleep(0.2)
                domain.verify_application(lambda path, **kwargs: domain.request(path, port=port, **kwargs))
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)
        if hashlib.sha256((candidate / 'package-lock.json').read_bytes()).hexdigest() != inputs.LOCK_SHA256:
            raise RuntimeError('Offline install changed the application lock.')
        print('OFFLINE_NPM_INSTALL_BUILD_AND_HTTP_PASS: exact 251-good/3-missing cache; native dependencies, 107 tests, build, FA/EN and application guards.')


if __name__ == '__main__':
    if sys.argv[1:] == ['--integration']:
        integration()
    else:
        unittest.main()
