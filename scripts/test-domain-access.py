#!/usr/bin/env python3
"""Access-mode boundary and rollback tests; temporary files, no production server."""
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import ExitStack, redirect_stdout
from unittest.mock import patch
import importlib.util
import io
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Access(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory(prefix='roya-access-test.')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.a = load('access_test', ROOT / 'deploy/domain-preview-access.py')
        self.m = self.a.m

        def mapped(name, *parts):
            path = Path(name, *parts)
            if path.is_relative_to(self.root) or path.is_relative_to(ROOT / 'deploy'):
                return path
            return self.root / str(path).lstrip('/')

        self.map = mapped
        for module in (self.a, self.m, self.m.tls, self.m.base):
            self.stack.enter_context(patch.object(module, 'Path', mapped))
        for key in ('ENV', 'UNIT', 'LINK', 'CANDIDATE_UNIT', 'CANDIDATE_ENV'):
            self.stack.enter_context(patch.object(self.m, key, str(mapped(getattr(self.m, key)))))
        self.stack.enter_context(patch.object(self.m.base, 'NGINX', str(mapped(self.m.base.NGINX))))
        self.release = next(iter(self.a.SOURCES))
        release = mapped(self.m.RELEASE_ROOT, self.release)
        release.mkdir(parents=True)
        (release / '.roya-release').write_text(self.release + '\n')
        (release / 'server.js').write_text('existing server')
        link = Path(self.m.LINK)
        link.parent.mkdir(parents=True, exist_ok=True)
        link.symlink_to(release)
        self.original = {
            self.m.base.NGINX: self.m.nginx_config(),
            self.m.ENV: 'PRIVATE ENVIRONMENT UNCHANGED',
            self.m.UNIT: 'EXISTING APPLICATION SERVICE',
            str(mapped(self.m.tls.AUTH_FILE)): 'EXISTING HASH UNCHANGED',
            str(mapped('/etc/nginx/another-site.conf')): 'OTHER SITE UNCHANGED',
        }
        for name, content in self.original.items():
            path = Path(name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        mapped(self.a.BACKUPS).mkdir(parents=True)
        self.events = []
        self.failure = ''
        self.real_preflight = self.m.preflight
        self.stack.enter_context(patch.object(self.m, 'preflight', self.preflight))
        self.stack.enter_context(patch.object(self.m, 'verify_application', lambda send: self.events.append('loopback-guards')))
        self.stack.enter_context(patch.object(self.m, 'wait_static_gate', lambda: self.events.append('static-access-ready')))
        self.stack.enter_context(patch.object(self.a, 'verify_surface', self.surface))
        self.stack.enter_context(patch.object(self.m.base, 'command', self.command))

    def preflight(self, resource_check=True):
        self.assertFalse(resource_check, 'Changing a gate must not require another application build.')
        self.m.select_access_mode(Path(self.m.base.NGINX).read_text())
        return {name: self.m.base.sha(name) for name in self.original if name not in (self.m.ENV, self.m.UNIT)}

    def command(self, args, timeout=15):
        self.events.append(tuple(args))
        self.assertNotIn('restart', args)
        if (self.failure == 'syntax' and args == ['nginx', '-t']) or (self.failure == 'reload' and args == ['systemctl', 'reload', 'nginx.service']):
            self.failure = ''
            raise RuntimeError('Injected configuration failure')
        return ''

    def surface(self):
        self.events.append('public-guards' if self.m.PUBLIC_PREVIEW else 'private-guards')
        if self.failure == 'surface' and self.m.PUBLIC_PREVIEW:
            self.failure = ''
            raise RuntimeError('Injected public guard failure')

    def change(self, public):
        output = io.StringIO()
        with redirect_stdout(output):
            self.a.change(public)
        self.assertNotIn('PRIVATE ENVIRONMENT UNCHANGED', output.getvalue())
        self.assertNotIn('EXISTING HASH UNCHANGED', output.getvalue())
        return output.getvalue()

    def backups(self):
        return sorted(self.map(self.a.BACKUPS).glob('domain-access-*'))

    def assert_preserved(self):
        for name, content in self.original.items():
            if name != self.m.base.NGINX:
                self.assertEqual(Path(name).read_text(), content)
        self.assertEqual(self.a.installed(), self.release)

    def test_open_then_rollback_preserves_password_app_other_sites_and_flags(self):
        self.assertIn('PUBLIC TEST PREVIEW READY', self.change(True))
        self.assertEqual(Path(self.m.base.NGINX).read_text(), self.m.nginx_config(public_preview=True))
        self.assertEqual(Path(self.m.base.NGINX).read_text().count('auth_basic off;'), 2)
        self.assert_preserved()
        directory = self.backups()[0]
        self.assertTrue((directory / 'restore.sh').is_file())
        with redirect_stdout(io.StringIO()):
            self.a.rollback(directory)
        self.assertEqual(Path(self.m.base.NGINX).read_text(), self.original[self.m.base.NGINX])
        self.assertFalse(self.m.PUBLIC_PREVIEW)
        self.assert_preserved()

    def test_repeated_open_is_idempotent_and_does_not_reload_nginx(self):
        self.change(True)
        self.events.clear()
        self.assertIn('already matches', self.change(True))
        self.assertEqual(len(self.backups()), 1)
        self.assertFalse(any(isinstance(event, tuple) for event in self.events))

    def test_close_and_its_rollback_retain_the_existing_password(self):
        self.change(True)
        before = set(self.backups())
        self.assertIn('PRIVATE PREVIEW GATE READY', self.change(False))
        self.assert_preserved()
        directory = (set(self.backups()) - before).pop()
        with redirect_stdout(io.StringIO()):
            self.a.rollback(directory)
        self.assertTrue(self.m.PUBLIC_PREVIEW)
        self.assert_preserved()

    def test_failed_syntax_reload_or_public_guard_restores_original_gate(self):
        for failure in ('syntax', 'reload', 'surface'):
            with self.subTest(failure=failure):
                self.failure = failure
                with self.assertRaisesRegex(RuntimeError, 'Injected'):
                    self.change(True)
                self.assertEqual(Path(self.m.base.NGINX).read_text(), self.original[self.m.base.NGINX])
                self.assert_preserved()

    def test_unknown_release_and_unknown_configuration_are_refused(self):
        self.original_release = Path(self.m.LINK, '.roya-release').read_text()
        Path(self.m.LINK, '.roya-release').write_text('UNKNOWN')
        with self.assertRaisesRegex(RuntimeError, 'Unsupported installed release'):
            self.change(True)
        self.assertFalse(self.backups())
        Path(self.m.LINK, '.roya-release').write_text(self.original_release)
        Path(self.m.base.NGINX).write_text('UNRECOGNIZED CONFIGURATION')
        with self.assertRaisesRegex(RuntimeError, 'nothing overwritten'):
            self.change(True)
        self.assertFalse(self.backups())

    def test_content_release_is_supported_without_rebuilding_or_changing_source_identity(self):
        content_release = '8f272a29a383ccc64b88964eea7e7dde0bd9db39'
        target = self.map(self.m.RELEASE_ROOT, content_release)
        target.mkdir()
        (target / '.roya-release').write_text(content_release + '\n')
        Path(self.m.LINK).unlink()
        Path(self.m.LINK).symlink_to(target)
        self.assertEqual(self.a.installed(), content_release)
        self.assertIn('PUBLIC TEST PREVIEW READY', self.change(True))
        self.assertEqual(self.m.release_id(), content_release)

    def test_corrupt_backup_and_later_operator_edits_prevent_partial_rollback(self):
        self.change(True)
        directory = self.backups()[0]
        original = (directory / 'original.conf').read_bytes()
        (directory / 'original.conf').write_text('CORRUPTED')
        before = Path(self.m.base.NGINX).read_bytes()
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            self.a.rollback(directory)
        self.assertEqual(Path(self.m.base.NGINX).read_bytes(), before)
        (directory / 'original.conf').write_bytes(original)
        Path(self.m.ENV).write_text('LATER ENVIRONMENT EDIT')
        with self.assertRaisesRegex(RuntimeError, 'protected configuration'):
            self.a.rollback(directory)
        self.assertEqual(Path(self.m.base.NGINX).read_bytes(), before)
        Path(self.m.ENV).write_text(self.original[self.m.ENV])
        Path(self.m.base.NGINX).write_text('LATER NGINX EDIT')
        with self.assertRaisesRegex(RuntimeError, 'Another operator'):
            self.a.rollback(directory)
        self.assertEqual(Path(self.m.base.NGINX).read_text(), 'LATER NGINX EDIT')

    def test_edit_during_application_preflight_is_not_adopted_or_overwritten(self):
        for name in (self.m.base.NGINX, self.m.ENV):
            def edit(_send):
                Path(name).write_text('CONCURRENT OPERATOR EDIT')
            with self.subTest(path=name), patch.object(self.m, 'verify_application', edit):
                with self.assertRaisesRegex(RuntimeError, 'protected configuration'):
                    self.change(True)
            self.assertEqual(Path(name).read_text(), 'CONCURRENT OPERATOR EDIT')
            self.assertFalse(self.backups())
            Path(name).write_text(self.original[name])

    def test_actual_preflight_refuses_enabled_live_orders_in_both_modes(self):
        # Exercise the real preflight before service commands, not the transaction stub.
        self.a.installed()
        database = self.map('/etc/roya/database.env')
        database.write_text('DATABASE_URL=postgresql://roya_app:hidden@127.0.0.1:5432/roya_store\nDIRECT_URL=postgresql://roya_app:hidden@127.0.0.1:5432/roya_store\n')
        values = {'HOSTNAME': '127.0.0.1', 'PORT': '3311', 'NEXTAUTH_URL': self.m.ORIGIN,
                  'NEXT_PUBLIC_SITE_URL': self.m.ORIGIN, 'ROYA_DEPLOYMENT_ROLE': 'standalone',
                  'ROYA_PRIVATE_DB_CATALOG': '1', 'ROYA_DEMO_CATALOG': '1', 'ROYA_INDEXABLE': '0',
                  'ROYA_LIVE_PAYMENTS': '0', 'ROYA_ACCEPT_ORDERS': '1', 'ROYA_SEND_SMS': '0',
                  'ROYA_INTERNATIONAL_ENABLED': '0', 'CUSTOMER_ACCOUNTS_ENABLED': '0',
                  'ROYA_TRUST_GEO_HEADER': '0', 'ROYA_PREVIEW_RELEASE': self.release, 'NEXTAUTH_SECRET': 'a' * 40}
        Path(self.m.ENV).write_text(''.join(key + '=' + value + '\n' for key, value in values.items()))
        for public in (False, True):
            Path(self.m.base.NGINX).write_text(self.m.nginx_config(public_preview=public))
            with self.subTest(public=public), self.assertRaisesRegex(RuntimeError, 'flags, origin or secret differ'):
                self.real_preflight(resource_check=False)
        self.assertFalse(self.backups())
        self.assertFalse(any(isinstance(event, tuple) for event in self.events))


class Policy(unittest.TestCase):
    def test_public_template_changes_only_authorization_and_stage(self):
        a = load('access_policy', ROOT / 'deploy/domain-preview-access.py')
        m = a.m
        gated = m.nginx_config(public_preview=False)
        public = m.nginx_config(public_preview=True)
        authorization = '    auth_basic "Roya private preview";\n    auth_basic_user_file ' + m.tls.AUTH_FILE + ';'
        expected = gated.replace(authorization, '    auth_basic off;').replace('X-Roya-Domain-Stage "' + m.MARKER + '"', 'X-Roya-Domain-Stage "' + m.PUBLIC_MARKER + '"')
        self.assertEqual(public, expected)
        self.assertIn('X-Robots-Tag "noindex, nofollow" always;', public)
        self.assertIn('proxy_set_header Authorization "";', public)
        self.assertIn('proxy_set_header X-Forwarded-Proto https;', public)
        for text, wanted in ((public, True), (gated, False)):
            m.select_access_mode(text)
            self.assertEqual(m.PUBLIC_PREVIEW, wanted)


class PublicUpgrade(unittest.TestCase):
    def setUp(self):
        harness = load('public_upgrade_harness', ROOT / 'scripts/test-domain-upgrade.py')
        self.c = harness.UpgradeTransaction(methodName='test_success_then_guarded_rollback')
        self.c.setUp()
        self.addCleanup(self.c.doCleanups)
        m = self.c.m
        m.PUBLIC_PREVIEW = True
        self.c.original[m.base.NGINX] = m.nginx_config()
        Path(m.base.NGINX).write_text(self.c.original[m.base.NGINX])
        self.c.stack.enter_context(patch.object(m.getpass, 'getpass', side_effect=AssertionError('Public preview must not ask for the old gate password.')))

    def test_upgrade_and_rollback_preserve_anonymous_access_without_password_prompt(self):
        self.assertIn('PUBLIC PREVIEW CONTENT UPGRADE READY', self.c.install())
        m = self.c.m
        self.assertTrue(m.PUBLIC_PREVIEW)
        with redirect_stdout(io.StringIO()):
            m.rollback(self.c.backup())
        self.c.assert_restored()
        self.assertTrue(m.PUBLIC_PREVIEW)

    def test_failed_application_restart_restores_previous_public_preview(self):
        self.c.failure = 'restart'
        with self.assertRaisesRegex(RuntimeError, 'restart failure'):
            self.c.install()
        self.c.assert_restored()
        self.assertTrue(self.c.m.PUBLIC_PREVIEW)


if __name__ == '__main__':
    unittest.main()
