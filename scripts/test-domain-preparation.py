#!/usr/bin/env python3
"""Fault-injection checks for configuration rollback; no real service is touched."""
from pathlib import Path
from contextlib import ExitStack, redirect_stdout
from tempfile import TemporaryDirectory
from unittest.mock import patch
import importlib.util
import io
import json
import os
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'deploy/prepare-private-domain.py'


class Preparation(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix='roya-domain-transaction.')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        spec = importlib.util.spec_from_file_location('domain_prepare', SOURCE)
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        def mapped(name, *parts):
            path = Path(name, *parts)
            return path if path.is_relative_to(self.root) else self.root / str(path).lstrip('/')
        self.map = mapped
        self.stack.enter_context(patch.object(self.m, 'Path', mapped))
        for key in ('NAMED', 'ZONE', 'INCLUDE', 'NGINX', 'ACME'):
            self.stack.enter_context(patch.object(self.m, key, str(mapped(getattr(self.m, key)))))
        for key in ('NAMED', 'ZONE', 'INCLUDE', 'NGINX', 'ACME'):
            Path(getattr(self.m, key)).parent.mkdir(parents=True, exist_ok=True)
        self.write('/opt/roya/preview-current/.roya-release', self.m.RELEASE)
        values = {'HOSTNAME':'127.0.0.1','PORT':'3311','ROYA_DEPLOYMENT_ROLE':'standalone',
                  'ROYA_PRIVATE_DB_CATALOG':'1','ROYA_DEMO_CATALOG':'1','ROYA_INDEXABLE':'0',
                  'ROYA_LIVE_PAYMENTS':'0','ROYA_ACCEPT_ORDERS':'0','ROYA_SEND_SMS':'0',
                  'NEXTAUTH_URL':'http://localhost:3311','NEXT_PUBLIC_SITE_URL':'http://localhost:3311',
                  'NEXTAUTH_SECRET':'SECRET-AUTH'}
        self.write('/etc/roya/preview.env', ''.join(key+'='+value+'\n' for key,value in values.items()))
        for name in ('/etc/roya/database.env','/etc/roya/backend.env',
                     '/etc/systemd/system/roya-preview.service','/etc/systemd/system/roya-store.service'):
            self.write(name, 'SECRET-ORIGINAL\n')
        self.write('/etc/nginx/nginx.conf', '# existing nginx\n')
        self.write('/etc/named/config/existing.conf', '# existing DNS\n')
        self.original = b'# existing named\ninclude "' + str(self.map('/etc/named/config/existing.conf')).encode() + b'";\n'
        Path(self.m.NAMED).write_bytes(self.original)
        self.mode = ''
        self.events = []
        self.stack.enter_context(patch.object(self.m, 'named_pid', lambda:123))
        self.stack.enter_context(patch.object(self.m, 'preview_health', lambda:None))
        self.stack.enter_context(patch.object(self.m, 'command', self.command))
        self.stack.enter_context(patch.object(self.m, 'dns', self.dns))
        self.stack.enter_context(patch.object(self.m, 'verify_web', self.verify_web))
        self.stack.enter_context(patch.object(self.m, 'reload_named', lambda:self.events.append('dns-reload')))
        self.stack.enter_context(patch.object(self.m.time, 'sleep', lambda seconds:None))

    def write(self, name, value):
        path = self.map(name);path.parent.mkdir(parents=True, exist_ok=True);path.write_text(value)

    def command(self, args, timeout=15):
        if args[0]=='ip':return json.dumps([{'addr_info':[{'local':self.m.IP}]}])
        if args[:2]==['named-checkconf','-p']:
            return ''.join('zone "'+name+'" { type master; };\n' for name in self.m.EXPECTED_ZONES)
        if args[:2]==['nginx','-T']:
            return '# configuration file '+str(self.map('/etc/nginx/nginx.conf'))+':\nserver_name existing.test;\n'
        if args[:2]==['nginx','-t'] and self.mode=='syntax' and Path(self.m.NGINX).exists():
            raise RuntimeError('Injected invalid new Nginx configuration.')
        if args[:2]==['systemctl','reload']:
            self.events.append('nginx-reload')
            if self.mode=='reload' and Path(self.m.NGINX).exists():raise RuntimeError('Injected reload failure.')
        return ''

    def verify_web(self):
        self.events.append('gate-verified')
        if self.mode=='gate':raise RuntimeError('Injected open web entry.')
        self.assertIn('ssl_reject_handshake on;', Path(self.m.NGINX).read_text())

    def dns(self, name, kind, tcp=False):
        if name in self.m.EXPECTED_ZONES:return [name+'. IN SOA existing.test. hostmaster.test. 1 2 3 4 5']
        if self.mode=='dns':raise RuntimeError('Injected DNS loading failure.')
        if kind=='A':return [name+'. IN A '+self.m.IP]
        if kind=='NS':return sorted([name+'. IN NS ns1.'+name+'.',name+'. IN NS ns2.'+name+'.'])
        if kind=='CNAME':return [name+'. IN CNAME '+self.m.DOMAIN+'.']
        raise AssertionError('Unexpected test DNS question')

    def prepare(self):
        out=io.StringIO()
        with redirect_stdout(out):self.m.prepare()
        return out.getvalue()

    def backup(self):return next(self.map('/var/backups/roya').glob('domain-prepare-*'))

    def assert_restored(self):
        self.assertEqual(Path(self.m.NAMED).read_bytes(),self.original)
        for key in ('ZONE','INCLUDE','NGINX'):self.assertFalse(Path(getattr(self.m,key)).exists())
        self.assertEqual(self.map('/etc/roya/database.env').read_text(),'SECRET-ORIGINAL\n')

    def test_success_then_explicit_restore(self):
        output=self.prepare();self.assertIn('PRIVATE DOMAIN DNS PREPARED',output);self.assertNotIn('SECRET-',output)
        self.assertLess(self.events.index('gate-verified'),self.events.index('dns-reload'))
        self.assertEqual(os.stat(self.map('/var/lib/roya/domain-acme')).st_mode&0o777,0o755)
        with redirect_stdout(io.StringIO()):self.m.rollback(self.backup())
        self.assert_restored()

    def test_syntax_failure_restores_before_reload(self):
        self.mode='syntax'
        with self.assertRaisesRegex(RuntimeError,'invalid new'):self.prepare()
        self.assert_restored()

    def test_reload_failure_restores(self):
        self.mode='reload'
        with self.assertRaisesRegex(RuntimeError,'reload failure'):self.prepare()
        self.assert_restored()

    def test_gate_failure_never_activates_zone(self):
        self.mode='gate'
        with self.assertRaisesRegex(RuntimeError,'open web'):self.prepare()
        self.assert_restored()
        self.assertEqual(self.events, ['nginx-reload', 'gate-verified', 'nginx-reload', 'dns-reload'])

    def test_dns_failure_restores(self):
        self.mode='dns'
        with self.assertRaisesRegex(RuntimeError,'did not load'):self.prepare()
        self.assert_restored()

    def test_rollback_preserves_a_later_edit(self):
        self.prepare();Path(self.m.NGINX).write_text('# later operator edit\n')
        before=Path(self.m.NAMED).read_bytes()
        with self.assertRaisesRegex(RuntimeError,'Another edit'):self.m.rollback(self.backup())
        self.assertEqual(Path(self.m.NAMED).read_bytes(),before)
        self.assertEqual(Path(self.m.NGINX).read_text(),'# later operator edit\n')

    def test_corrupt_backup_refused_before_any_restore(self):
        self.prepare();backup=self.backup();state=json.loads((backup/'state.json').read_text())
        (backup/state['files'][self.m.NAMED]['copy']).write_text('corrupt')
        with self.assertRaisesRegex(RuntimeError,'Backup checksum'):self.m.rollback(backup)
        self.assertTrue(Path(self.m.NGINX).exists());self.assertTrue(Path(self.m.ZONE).exists())


class ReloadReadiness(unittest.TestCase):
    def setUp(self):
        spec=importlib.util.spec_from_file_location('domain_reload', SOURCE)
        self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)

    def test_waits_for_new_workers_for_both_hosts(self):
        replies=[(200,b'old',None),(404,b'old',None),
                 (404,b'',self.m.WEB_MARKER),(404,b'',self.m.WEB_MARKER)]
        with patch.object(self.m,'web',side_effect=replies) as request, patch.object(self.m.time,'sleep') as pause:
            self.m.wait_web_ready()
        self.assertEqual(request.call_count,4);pause.assert_called_once()
        self.assertEqual([call.args[0] for call in request.call_args_list],
                         [self.m.DOMAIN,'www.'+self.m.DOMAIN]*2)

    def test_old_default_404_is_not_readiness(self):
        with patch.object(self.m,'web',return_value=(404,b'',None)):
            with self.assertRaisesRegex(RuntimeError,'HTTP 404; new configuration marker absent'):
                self.m.wait_web_ready(timeout_seconds=0)

    def test_new_gate_must_reject_access(self):
        with patch.object(self.m,'web',return_value=(200,b'',self.m.WEB_MARKER)):
            with self.assertRaisesRegex(RuntimeError,'Domain gate failed: GET.*HTTP 200'):
                self.m.wait_web_ready()

    def test_wrong_route_reports_method_host_path_status_without_body(self):
        with TemporaryDirectory() as temporary, patch.object(self.m,'ACME',temporary), \
             patch.object(self.m,'wait_web_ready'), patch.object(self.m,'web',side_effect=[
                 (404,b'',self.m.WEB_MARKER),(404,b'',self.m.WEB_MARKER),
                 (200,b'PRIVATE RESPONSE BODY',self.m.WEB_MARKER)]):
            Path(temporary,'.well-known/acme-challenge').mkdir(parents=True)
            with self.assertRaisesRegex(RuntimeError,'GET royahealthyfood.ir/fa/catalog/ HTTP 200') as failure:
                self.m.verify_web()
            self.assertNotIn('PRIVATE RESPONSE',str(failure.exception))
            self.assertEqual(list(Path(temporary,'.well-known/acme-challenge').iterdir()),[])


if __name__=='__main__':unittest.main()
