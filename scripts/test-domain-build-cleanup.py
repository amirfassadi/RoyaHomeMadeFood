#!/usr/bin/env python3
"""Deletion-boundary regressions in temporary directories, never the VPS."""
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import redirect_stdout
from unittest.mock import patch
import hashlib
import importlib.util
import io
import json
import shutil
import unittest

spec = importlib.util.spec_from_file_location('compact', Path(__file__).resolve().parents[1] / 'deploy/compact-domain-build.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Boundaries(unittest.TestCase):
    def test_compaction_retains_stage_and_source_and_refuses_unsafe_candidates_before_removal(self):
        for case in ('success', 'external-link', 'descriptor', 'dependency-link', 'candidate-link', 'incomplete', 'outside-root'):
            with self.subTest(case=case), TemporaryDirectory(prefix='roya-compact-test.') as directory:
                root = Path(directory)
                candidate = root / 'domain-source.test'
                candidate.mkdir()
                stage = candidate / '.roya-domain-stage'
                (stage / '.next').mkdir(parents=True)
                (stage / 'server.js').write_text('standalone server')
                (stage / '.next/BUILD_ID').write_text('test')
                (candidate / 'node_modules').mkdir()
                (candidate / 'node_modules/package').write_text('redundant dependency')
                (candidate / '.next').mkdir()
                (candidate / '.next/cache').write_text('redundant cache')
                (candidate / 'package.json').write_text('source retained')
                outside = root / 'outside'
                outside.mkdir()
                (outside / 'keep').write_text('outside unchanged')
                files = {'package.json': hashlib.sha256(b'source retained').hexdigest()}
                manifest = {'format': 1, 'origin': 'https://royahealthyfood.ir', 'files': files,
                            'sourceRelease': hashlib.sha1(json.dumps(files, sort_keys=True).encode()).hexdigest()}
                source = manifest['sourceRelease']
                descriptor = {'release': hashlib.sha1(('roya-private-domain-v1\n' + source + '\n' + manifest['origin']).encode()).hexdigest(),
                              'sourceRelease': source, 'origin': manifest['origin']}
                for path in (candidate, stage):
                    (path / '.roya-origin.json').write_text(json.dumps(descriptor))
                requested = candidate
                if case == 'external-link':
                    (stage / 'external').symlink_to(outside, target_is_directory=True)
                if case == 'descriptor':
                    (stage / '.roya-origin.json').write_text('{}')
                if case == 'dependency-link':
                    shutil.rmtree(candidate / 'node_modules')
                    (candidate / 'node_modules').symlink_to(outside, target_is_directory=True)
                if case == 'candidate-link':
                    requested = root / 'domain-source.alias'
                    requested.symlink_to(candidate, target_is_directory=True)
                if case == 'incomplete':
                    (stage / '.next/BUILD_ID').unlink()
                with patch.object(m, 'SETUP_ROOT', root / 'other' if case == 'outside-root' else root):
                    if case == 'success':
                        with redirect_stdout(io.StringIO()):
                            m.compact(requested, manifest)
                        self.assertFalse((candidate / 'node_modules').exists())
                        self.assertFalse((candidate / '.next').exists())
                        self.assertEqual((stage / '.next/BUILD_ID').read_text(), 'test')
                    else:
                        with self.assertRaises(RuntimeError):
                            m.compact(requested, manifest)
                        self.assertTrue((candidate / '.next/cache').is_file())
                self.assertEqual((stage / 'server.js').read_text(), 'standalone server')
                self.assertEqual((candidate / 'package.json').read_text(), 'source retained')
                self.assertEqual((outside / 'keep').read_text(), 'outside unchanged')


if __name__ == '__main__':
    unittest.main()
