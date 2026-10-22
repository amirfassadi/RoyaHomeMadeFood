#!/usr/bin/env python3
"""Origin cutover/rollback fault injection in temporary files; no VPS or CA access."""
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import ExitStack, redirect_stdout
from unittest.mock import patch
from types import SimpleNamespace
import importlib.util
import io
import json
import hashlib
import os
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'deploy/connect-private-domain.py'


def module():
    spec = importlib.util.spec_from_file_location('origin_test', SOURCE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def unit(m):
    return '\n'.join(['# Managed Roya private unified preview', '[Service]', 'User=roya-store', 'Group=roya-store',
                      'WorkingDirectory=' + m.LINK, 'EnvironmentFile=/etc/roya/database.env',
                      'EnvironmentFile=' + m.ENV, 'ExecStart=/opt/roya/tools/node/bin/node ' + m.LINK + '/server.js',
                      'ReadWritePaths=' + m.previous_target() + '/.next', 'NoNewPrivileges=true', ''])


class Policy(unittest.TestCase):
    def setUp(self):
        self.m = module()

    def test_security_patch_manifest_changes_only_locked_framework_dependencies(self):
        root = SOURCE.parents[1]
        old = json.loads((root / 'deploy/private-preview-manifest.json').read_text())
        new = json.loads((root / 'deploy/private-domain-app-manifest.json').read_text())
        self.assertEqual(new['baseRelease'], old['release_id'])
        self.assertEqual(new['sourceRelease'], self.m.SOURCE_RELEASE)
        self.assertEqual(hashlib.sha1(json.dumps(new['files'], sort_keys=True).encode()).hexdigest(), self.m.SOURCE_RELEASE)
        self.assertEqual(set(new['files']), set(old['target_files']))
        self.assertEqual({name for name, digest in new['files'].items() if old['target_files'][name] != digest}, {'package.json', 'package-lock.json'})
        for name in ('package.json', 'package-lock.json'):
            self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(), new['files'][name])
        package = json.loads((root / 'package.json').read_text())
        lock = json.loads((root / 'package-lock.json').read_text())
        self.assertEqual(package['dependencies']['next'], '16.4.2')
        self.assertEqual(lock['packages']['node_modules/next']['version'], '16.4.2')

    def test_origin_updates_preserve_secrets_and_disabled_effects(self):
        text = 'NEXTAUTH_URL=http://localhost:3311\nNEXT_PUBLIC_SITE_URL=http://localhost:3311\nPORT=3311\nROYA_PREVIEW_RELEASE=old\nNEXTAUTH_SECRET=PRIVATE-UNCHANGED\nROYA_LIVE_PAYMENTS=0\n'
        updated = self.m.environment(text, 3312)
        self.assertIn('NEXTAUTH_SECRET=PRIVATE-UNCHANGED\n', updated)
        self.assertIn('ROYA_LIVE_PAYMENTS=0\n', updated)
        self.assertIn('PORT=3312\n', updated)
        self.assertNotIn('localhost', updated)
        with self.assertRaisesRegex(RuntimeError, 'one private environment'):
            self.m.environment(text + 'PORT=9\n', 3312)

    def test_candidate_is_separate_and_only_main_cache_path_changes(self):
        target = '/opt/roya/preview-releases/' + self.m.release_id()
        original = unit(self.m)
        main = self.m.service(original, target)
        self.assertEqual(main, original.replace(self.m.previous_target() + '/.next', target + '/.next'))
        candidate = self.m.service(original, target, True)
        self.assertIn('EnvironmentFile=' + self.m.CANDIDATE_ENV, candidate)
        self.assertIn('WorkingDirectory=' + target, candidate)
        self.assertIn('User=roya-store', candidate)
        with self.assertRaisesRegex(RuntimeError, 'service configuration'):
            self.m.service(original + 'Environment=PORT=80\n', target)

    def test_proxy_keeps_auth_and_scrubs_browser_basic_credentials(self):
        text = self.m.nginx_config()
        self.assertEqual(text.count('auth_basic_user_file ' + self.m.tls.AUTH_FILE), 2)
        self.assertEqual(text.count('satisfy all;'), 2)
        self.assertIn('proxy_set_header Authorization "";', text)
        self.assertIn('proxy_set_header Host ' + self.m.base.DOMAIN, text)
        self.assertIn('proxy_set_header X-Forwarded-Proto https;', text)
        self.assertIn('try_files /_roya_never_serve_www @roya_apex;', text)
        self.assertNotIn('auth_basic off', text)


class Transaction(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory(prefix='roya-origin-transaction.')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.m = module()
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        def mapped(name, *parts):
            path = Path(name, *parts)
            if path.is_relative_to(self.root) or path.is_relative_to(SOURCE.parent):
                return path
            return self.root / str(path).lstrip('/')
        self.map = mapped
        for target in (self.m, self.m.tls, self.m.base):
            self.stack.enter_context(patch.object(target, 'Path', mapped))
        for key in ('ENV', 'UNIT', 'LINK', 'CANDIDATE_UNIT', 'CANDIDATE_ENV'):
            self.stack.enter_context(patch.object(self.m, key, str(mapped(getattr(self.m, key)))))
        self.stack.enter_context(patch.object(self.m.base, 'NGINX', str(mapped(self.m.base.NGINX))))
        self.original = {self.m.ENV: 'NEXTAUTH_URL=http://localhost:3311\nNEXT_PUBLIC_SITE_URL=http://localhost:3311\nPORT=3311\nROYA_PREVIEW_RELEASE=old\nNEXTAUTH_SECRET=NEVER-PRINT-THIS\n',
                         self.m.UNIT: unit(self.m), self.m.base.NGINX: 'ORIGINAL PRIVATE TLS GATE\n'}
        for name, body in self.original.items():
            p = Path(name)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body)
        previous = Path(self.m.previous_target())
        previous.mkdir(parents=True)
        (previous / 'server.js').write_text('old server')
        Path(self.m.LINK).symlink_to(previous)
        self.map('/var/backups/roya').mkdir(parents=True)
        self.stage = self.map('/home/amir/roya-setup/candidate/stage')
        self.stage.mkdir(parents=True)
        (self.stage / 'server.js').write_text('new candidate server')
        (self.stage / '.roya-origin.json').write_text(json.dumps({'release': self.m.release_id(), 'sourceRelease': self.m.SOURCE_RELEASE, 'origin': self.m.ORIGIN}))
        self.other = self.map('/etc/nginx/other-site.conf')
        self.other.parent.mkdir(parents=True, exist_ok=True)
        self.other.write_text('UNCHANGED OTHER SITE')
        self.events = []
        self.failure = ''
        self.stack.enter_context(patch.object(self.m, 'preflight', lambda: {str(self.other): self.m.base.sha(self.other)}))
        self.stack.enter_context(patch.object(self.m.tls.getpass, 'getpass', return_value='HiddenPrivatePassword123!'))
        self.stack.enter_context(patch.object(self.m.tls, 'verify_gate', self.gate))
        self.stack.enter_context(patch.object(self.m, 'verify_proxy', self.proxy))
        self.stack.enter_context(patch.object(self.m, 'verify_application', self.application))
        self.stack.enter_context(patch.object(self.m, 'wait_app', lambda port: self.events.append('ready-' + str(port))))
        self.stack.enter_context(patch.object(self.m, 'wait_static_gate', lambda: self.events.append('static-gate-ready')))
        self.stack.enter_context(patch.object(self.m.base, 'command', self.command))
        self.stack.enter_context(patch.object(self.m.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid())))

    def gate(self, password):
        self.events.append('old-gate-login')
        if self.failure == 'password':
            raise RuntimeError('Wrong private password')

    def proxy(self, password):
        self.events.append('new-proxy-check')
        if self.failure == 'proxy':
            raise RuntimeError('Injected proxy verification failure')

    def application(self, send):
        self.events.append('application-check')
        if self.failure == 'candidate':
            raise RuntimeError('Injected candidate failure')

    def command(self, args, timeout=15):
        self.events.append(' '.join(args))
        if args[:2] == ['ss', '-lntH']:
            return 'LISTEN 0 511 127.0.0.1:3312 0.0.0.0:*\n'
        if self.failure == 'restart' and args == ['systemctl', 'restart', 'roya-preview.service']:
            self.failure = ''
            raise RuntimeError('Injected restart failure')
        return ''

    def install(self):
        output = io.StringIO()
        with redirect_stdout(output):
            self.m.install(self.stage)
        self.assertNotIn('NEVER-PRINT-THIS', output.getvalue())
        self.assertNotIn('HiddenPrivatePassword123!', output.getvalue())
        return output.getvalue()

    def backup(self):
        return next(self.map('/var/backups/roya').glob('domain-origin-*'))

    def assert_restored(self):
        for name, body in self.original.items():
            self.assertEqual(Path(name).read_text(), body)
        self.assertEqual(str(Path(self.m.LINK).resolve()), self.m.previous_target())
        self.assertFalse(Path(self.m.CANDIDATE_ENV).exists())
        self.assertFalse(Path(self.m.CANDIDATE_UNIT).exists())
        self.assertEqual(self.other.read_text(), 'UNCHANGED OTHER SITE')

    def test_success_then_guarded_rollback(self):
        self.assertIn('PRIVATE DOMAIN STOREFRONT READY', self.install())
        self.assertLess(self.events.index('application-check'), self.events.index('systemctl restart roya-preview.service'))
        self.assertFalse(Path(self.m.CANDIDATE_UNIT).exists())
        with redirect_stdout(io.StringIO()):
            self.m.rollback(self.backup())
        self.assert_restored()
        self.assertLess(self.events.index('static-gate-ready'), len(self.events) - 1)

    def test_failed_candidate_does_not_switch_running_application(self):
        self.failure = 'candidate'
        with self.assertRaisesRegex(RuntimeError, 'candidate failure'):
            self.install()
        self.assertNotIn('systemctl restart roya-preview.service', self.events)
        self.assert_restored()

    def test_restart_or_proxy_failure_restores_previous_private_gate(self):
        for failure in ('restart', 'proxy'):
            with self.subTest(failure=failure):
                self.failure = failure
                with self.assertRaisesRegex(RuntimeError, 'failure'):
                    self.install()
                self.assert_restored()
                # Retained failed artifacts are reviewable and never overwritten.
                import shutil
                shutil.rmtree(self.map('/opt/roya/preview-releases/' + self.m.release_id()))

    def test_wrong_private_password_causes_no_config_or_release_change(self):
        self.failure = 'password'
        with self.assertRaisesRegex(RuntimeError, 'Wrong private password'):
            self.install()
        self.assertEqual(list(self.map('/var/backups/roya').iterdir()), [])
        self.assertFalse(self.map('/opt/roya/preview-releases/' + self.m.release_id()).exists())
        self.assert_restored()

    def test_rollback_refuses_later_operator_edit_without_partial_restore(self):
        self.install()
        Path(self.m.ENV).write_text('LATER OPERATOR EDIT\n')
        before = Path(self.m.base.NGINX).read_text()
        with self.assertRaisesRegex(RuntimeError, 'Another edit'):
            self.m.rollback(self.backup())
        self.assertEqual(Path(self.m.base.NGINX).read_text(), before)
        self.assertEqual(Path(self.m.ENV).read_text(), 'LATER OPERATOR EDIT\n')

    def test_corrupt_backup_refused_before_any_restore(self):
        self.install()
        directory = self.backup()
        state = json.loads((directory / 'state.json').read_text())
        (directory / state['files'][self.m.ENV]['copy']).write_text('CORRUPT')
        before = Path(self.m.base.NGINX).read_text()
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            self.m.rollback(directory)
        self.assertEqual(Path(self.m.base.NGINX).read_text(), before)


if __name__ == '__main__':
    unittest.main()
