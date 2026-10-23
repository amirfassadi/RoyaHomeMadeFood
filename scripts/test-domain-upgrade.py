#!/usr/bin/env python3
"""Upgrade source integrity and transaction failure tests; temporary files only."""
from pathlib import Path
from contextlib import redirect_stdout
from unittest.mock import patch
from tempfile import TemporaryDirectory
import importlib.util
import io
import json
import hashlib
import shutil
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('origin_upgrade_tests', ROOT / 'scripts/test-domain-origin.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
original_module = old.module


def module():
    m = original_module()
    m.configure_upgrade()
    return m


class Sources(unittest.TestCase):
    def test_upgrade_manifest_matches_complete_sources_and_covers_bilingual_content_and_preserves_existing_business_rules(self):
        m = module()
        manifest = json.loads((ROOT / 'deploy/private-domain-upgrade-manifest.json').read_text())
        previous = json.loads((ROOT / 'deploy/private-domain-upgrade-base-manifest.json').read_text())
        self.assertEqual(manifest['baseRelease'], '3f6a74cef79ac602d6b9f34f57eca7ed0989a54d')
        self.assertEqual(m.release_id(), 'fefdd25947ce179427b586550fbf8af2fbd7cdef')
        changed = {n for n, digest in manifest['files'].items() if previous['files'].get(n) != digest}
        self.assertEqual(changed, {'src/app/api/admin/settings/content/route.ts', 'scripts/test-admin-content.mjs', 'tests/integration/content.test.ts', 'src/app/[locale]/about/page.tsx', 'src/components/admin/shell.tsx', 'src/lib/server/contact-settings.ts', 'src/components/store/page-shell.tsx', 'tests/server/storefront-content.test.ts', 'src/lib/storefront-content.ts', 'src/lib/server/storefront-content.ts', 'src/app/admin/(protected)/content/page.tsx', 'src/components/admin/content-editor.tsx', 'tests/storefront-content.test.ts', 'src/components/store/footer.tsx', 'tests/browser/content-editor-fixture.tsx', 'src/app/[locale]/page.tsx', 'docs/ADMIN-CONTENT.md'})
        for name, digest in manifest['files'].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), digest, name)

    def test_actual_shell_preparation_verifies_sources_and_descriptor(self):
        shell = (ROOT / 'deploy/upgrade-private-domain.sh').read_text()
        program = shell.split("<<'PREPARE'\n", 1)[1].split('\nPREPARE', 1)[0]
        with TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'candidate'
            destination.mkdir()
            import subprocess
            result = subprocess.run(['python3', '-', str(ROOT), str(destination)], input=program, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads((destination / '.roya-origin.json').read_text()),
                             {'release': module().release_id(), 'sourceRelease': module().SOURCE_RELEASE, 'origin': module().ORIGIN})
            # A modified application file must fail before npm or any service action.
            copied = Path(temporary) / 'source'
            shutil.copytree(destination, copied)
            (copied / 'deploy').mkdir(exist_ok=True)
            shutil.copyfile(ROOT / 'deploy/private-domain-upgrade-manifest.json', copied / 'deploy/private-domain-upgrade-manifest.json')
            (copied / 'src/lib/prototype.ts').write_text('TAMPERED')
            refused = subprocess.run(['python3', '-', str(copied), str(destination)], input=program, text=True, capture_output=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('private application source differs', refused.stderr)

    def test_unknown_release_or_proxy_is_rejected_before_services(self):
        m = module()
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            proxy = root / 'proxy.conf'
            proxy.write_text('UNRECOGNIZED PROXY')
            with patch.object(m.base, 'NGINX', str(proxy)), patch.object(m.base, 'command') as commands:
                with self.assertRaisesRegex(RuntimeError, 'gate'):
                    m.preflight()
                commands.assert_not_called()
            proxy.write_text(m.nginx_config())
            release = root / 'unexpected-release'
            release.mkdir()
            link = root / 'current'
            link.symlink_to(release)
            with patch.object(m.base, 'NGINX', str(proxy)), patch.object(m, 'LINK', str(link)), patch.object(m.base, 'command') as commands:
                with self.assertRaisesRegex(RuntimeError, 'target differs'):
                    m.preflight()
                commands.assert_not_called()


class UpgradeTransaction(old.Transaction):
    def setUp(self):
        with patch.object(old, 'module', module):
            super().setUp()
        self.proxy_calls = 0
        self.stack.enter_context(patch.object(self.m, 'verify_proxy', self.proxy))
        # An upgrade begins and rolls back to an application gate, not the earlier static gate.
        self.original[self.m.base.NGINX] = self.m.nginx_config()
        Path(self.m.base.NGINX).write_text(self.original[self.m.base.NGINX])
        self.stack.enter_context(patch.object(self.m, 'preflight', lambda: {
            str(self.other): self.m.base.sha(self.other), self.m.base.NGINX: self.m.base.sha(self.m.base.NGINX)}))

    def proxy(self, password):
        self.proxy_calls += 1
        self.events.append('new-proxy-check')
        if self.failure == 'password':
            raise RuntimeError('Wrong private password')
        if self.failure == 'proxy' and self.proxy_calls > 1:
            raise RuntimeError('Injected proxy verification failure')

    def test_success_then_guarded_rollback(self):
        self.assertIn('PRIVATE CONTENT UPGRADE READY', self.install())
        self.assertEqual(Path(self.m.base.NGINX).read_text(), self.original[self.m.base.NGINX])
        directory = self.backup()
        self.assertIn('--upgrade --rollback', (directory / 'restore.sh').read_text())
        self.assertTrue((directory / 'private-domain-upgrade-manifest.json').is_file())
        with redirect_stdout(io.StringIO()):
            self.m.rollback(directory)
        self.assert_restored()

    def test_restart_or_proxy_failure_restores_previous_private_gate(self):
        for failure in ('restart', 'proxy'):
            with self.subTest(failure=failure):
                self.proxy_calls = 0
                self.failure = failure
                with self.assertRaisesRegex(RuntimeError, 'failure'):
                    self.install()
                self.assert_restored()
                shutil.rmtree(self.map('/opt/roya/preview-releases/' + self.m.release_id()))

    def test_rollback_refuses_modified_candidate_before_partial_restore(self):
        self.install()
        Path(self.m.CANDIDATE_ENV).write_text('LATER CANDIDATE EDIT')
        env_before = Path(self.m.ENV).read_bytes()
        with self.assertRaisesRegex(RuntimeError, 'candidate service'):
            self.m.rollback(self.backup())
        self.assertEqual(Path(self.m.ENV).read_bytes(), env_before)


if __name__ == '__main__':
    unittest.main()
