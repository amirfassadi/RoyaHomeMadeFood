#!/usr/bin/env python3
"""TLS-gate transactions against temporary files; CA and service calls are mocked."""
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import ExitStack, redirect_stdout
from unittest.mock import patch
import importlib.util
import io
import json
import os
import unittest
from types import SimpleNamespace

SOURCE=Path(__file__).resolve().parents[1]/'deploy/enable-private-domain-tls.py'
PASSWORD='PrivateRoya123!'

def module():
    spec=importlib.util.spec_from_file_location('tls_test',SOURCE)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value


class Transaction(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory(prefix='roya-tls-transaction.');self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.m=module();self.stack=ExitStack();self.addCleanup(self.stack.close)
        def mapped(name,*parts):
            p=Path(name,*parts)
            if p.is_relative_to(self.root) or p.is_relative_to(SOURCE.parent):return p
            return self.root/str(p).lstrip('/')
        self.map=mapped
        for target in (self.m,self.m.base):self.stack.enter_context(patch.object(target,'Path',mapped))
        for key in ('AUTH_DIR','AUTH_FILE','WEB_ROOT','READY_FILE','CERT_ROOT','CERT','KEY','RENEWAL'):
            self.stack.enter_context(patch.object(self.m,key,str(mapped(getattr(self.m,key)))))
        for key in ('NAMED','ZONE','INCLUDE','NGINX','ACME'):
            self.stack.enter_context(patch.object(self.m.base,key,str(mapped(getattr(self.m.base,key)))))
        for key in ('AUTH_DIR','WEB_ROOT','RENEWAL'):
            Path(getattr(self.m,key)).parent.mkdir(parents=True,exist_ok=True)
        self.map('/var/backups/roya').mkdir(parents=True)
        self.write('/opt/roya/preview-current/.roya-release',self.m.base.RELEASE)
        values={'HOSTNAME':'127.0.0.1','PORT':'3311','ROYA_DEPLOYMENT_ROLE':'standalone',
                'ROYA_PRIVATE_DB_CATALOG':'1','ROYA_DEMO_CATALOG':'1','ROYA_INDEXABLE':'0',
                'ROYA_LIVE_PAYMENTS':'0','ROYA_ACCEPT_ORDERS':'0','ROYA_SEND_SMS':'0',
                'ROYA_TRUST_GEO_HEADER':'0','NEXTAUTH_URL':'http://localhost:3311',
                'NEXT_PUBLIC_SITE_URL':'http://localhost:3311','NEXTAUTH_SECRET':'UNCHANGED-ADMIN-SECRET'}
        self.write('/etc/roya/preview.env',''.join(k+'='+v+'\n' for k,v in values.items()))
        self.write('/etc/nginx/existing-site.conf','EXISTING-SITE\n')
        Path(self.m.base.NGINX).parent.mkdir(parents=True,exist_ok=True)
        self.original=self.m.base.nginx_text();Path(self.m.base.NGINX).write_text(self.original)
        self.events=[];self.mode='';self.saved=None
        self.stack.enter_context(patch.object(self.m.base,'command',self.command))
        self.stack.enter_context(patch.object(self.m.base,'preview_health',lambda:None))
        self.stack.enter_context(patch.object(self.m.base,'verify_web',lambda:self.events.append('closed-check')))
        self.stack.enter_context(patch.object(self.m.base,'dns',lambda *a,**k:[self.m.DOMAIN+'. IN A '+self.m.IP]))
        self.stack.enter_context(patch.object(self.m,'public_dns_ready',lambda:self.mode!='dns-wait'))
        self.stack.enter_context(patch.object(self.m,'worker_gid',lambda config:os.getgid()))
        self.stack.enter_context(patch.object(self.m,'protected_files',lambda config:{str(self.map('/etc/roya/preview.env')):self.m.base.sha(self.map('/etc/roya/preview.env'))}))
        self.stack.enter_context(patch.object(self.m,'certificate_valid',lambda:self.events.append('certificate-verified')))
        self.stack.enter_context(patch.object(self.m,'verify_gate',self.verify_gate))
        self.stack.enter_context(patch.object(self.m.os,'access',lambda *a:True))
        self.stack.enter_context(patch.object(self.m.shutil,'which',lambda n:'/usr/sbin/'+n))
        self.stack.enter_context(patch.object(self.m.getpass,'getpass',self.password))

    def write(self,name,text):
        p=self.map(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)

    def password(self,prompt):self.events.append('password-prompt');return PASSWORD

    def command(self,args,timeout=15):
        if args[:2]==['nginx','-T']:return 'user nobody;\n'
        if args[0].endswith('certbot'):
            if args[1]=='certonly':
                self.events.append('issue')
                for name in (self.m.CERT,self.m.KEY,self.m.RENEWAL):
                    p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text('OWN-CERTIFICATE')
                if self.mode=='issue':raise RuntimeError('Injected certificate issue failure.')
            if args[1]=='renew':
                self.events.append('renew')
                if self.mode=='renew':raise RuntimeError('Injected renewal test failure.')
        if args[:2]==['nginx','-t'] and self.mode=='syntax' and Path(self.m.AUTH_FILE).exists():
            raise RuntimeError('Injected TLS syntax failure.')
        if args[:2]==['systemctl','reload']:self.events.append('nginx-reload')
        return ''

    def verify_gate(self,password):
        self.events.append('gate-check');self.assertEqual(password,PASSWORD)
        self.assertIn('$6$',Path(self.m.AUTH_FILE).read_text());self.assertNotIn(PASSWORD,Path(self.m.AUTH_FILE).read_text())
        self.assertEqual(Path(self.m.AUTH_FILE).stat().st_mode&0o777,0o640)
        self.assertEqual(Path(self.m.AUTH_FILE).stat().st_gid,os.getgid())
        if self.mode=='gate':raise RuntimeError('Injected private gate failure.')

    def run_enable(self):
        output=io.StringIO()
        with redirect_stdout(output):result=self.m.enable()
        self.assertNotIn(PASSWORD,output.getvalue());self.assertNotIn('UNCHANGED-ADMIN-SECRET',output.getvalue())
        return result,output.getvalue()

    def backup(self):return next(self.map('/var/backups/roya').glob('domain-tls-*'))

    def assert_closed(self):
        self.assertEqual(Path(self.m.base.NGINX).read_text(),self.original)
        self.assertFalse(Path(self.m.AUTH_FILE).exists());self.assertFalse(Path(self.m.READY_FILE).exists())
        self.assertIn('UNCHANGED-ADMIN-SECRET',self.map('/etc/roya/preview.env').read_text())
        self.assertEqual(self.map('/etc/nginx/existing-site.conf').read_text(),'EXISTING-SITE\n')

    def test_dns_wait_has_no_ca_password_or_config_effect(self):
        self.mode='dns-wait';result,output=self.run_enable()
        self.assertFalse(result);self.assertIn('DNS WAIT',output)
        self.assertNotIn('issue',self.events);self.assertNotIn('password-prompt',self.events)
        self.assertEqual(list(self.map('/var/backups/roya').iterdir()),[]);self.assert_closed()

    def test_success_and_guarded_rollback_preserve_certificate(self):
        result,output=self.run_enable();self.assertTrue(result);self.assertIn('PRIVATE TLS GATE READY',output)
        self.assertLess(self.events.index('closed-check'),self.events.index('issue'))
        self.assertLess(self.events.index('renew'),self.events.index('password-prompt'))
        self.assertLess(self.events.index('password-prompt'),self.events.index('nginx-reload'))
        with redirect_stdout(io.StringIO()):self.m.rollback(self.backup())
        self.assert_closed();self.assertTrue(Path(self.m.CERT).is_file())

    def test_issue_failure_leaves_domain_closed(self):
        self.mode='issue'
        with self.assertRaisesRegex(RuntimeError,'issue failure'):self.run_enable()
        self.assertNotIn('password-prompt',self.events);self.assert_closed()

    def test_renewal_failure_leaves_domain_closed(self):
        self.mode='renew'
        with self.assertRaisesRegex(RuntimeError,'renewal test failure'):self.run_enable()
        self.assertNotIn('password-prompt',self.events);self.assert_closed()

    def test_syntax_failure_rolls_back(self):
        self.mode='syntax'
        with self.assertRaisesRegex(RuntimeError,'syntax failure'):self.run_enable()
        self.assert_closed()

    def test_gate_failure_rolls_back(self):
        self.mode='gate'
        with self.assertRaisesRegex(RuntimeError,'private gate failure'):self.run_enable()
        self.assert_closed()

    def test_rollback_does_not_overwrite_a_later_edit(self):
        self.run_enable();Path(self.m.base.NGINX).write_text('# later operator edit\n')
        with self.assertRaisesRegex(RuntimeError,'Another edit'):self.m.rollback(self.backup())
        self.assertEqual(Path(self.m.base.NGINX).read_text(),'# later operator edit\n')
        self.assertTrue(Path(self.m.AUTH_FILE).exists())

    def test_wrong_password_confirmation_keeps_domain_closed(self):
        with patch.object(self.m.getpass,'getpass',side_effect=[PASSWORD,'a different confirmation']):
            with self.assertRaisesRegex(RuntimeError,'passwords differ'):self.run_enable()
        self.assert_closed()

    def test_corrupt_backup_is_refused_before_deleting_gate_files(self):
        self.run_enable();backup=self.backup();state=json.loads((backup/'state.json').read_text())
        (backup/state['files'][self.m.base.NGINX]['copy']).write_text('corrupt')
        with self.assertRaisesRegex(RuntimeError,'backup checksum'):self.m.rollback(backup)
        self.assertTrue(Path(self.m.AUTH_FILE).exists());self.assertTrue(Path(self.m.READY_FILE).exists())

    def test_unknown_private_directory_is_not_served(self):
        Path(self.m.WEB_ROOT).mkdir();Path(self.m.WEB_ROOT,'unknown.txt').write_text('Do not serve')
        with self.assertRaisesRegex(RuntimeError,'not empty'):self.run_enable()
        self.assertNotIn('issue',self.events)
        self.assertEqual(Path(self.m.WEB_ROOT,'unknown.txt').read_text(),'Do not serve')

    def test_existing_certificate_is_reused_without_production_issue(self):
        for name in (self.m.CERT,self.m.KEY,self.m.RENEWAL):
            p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text('OWN-CERTIFICATE')
        self.run_enable();self.assertNotIn('issue',self.events);self.assertIn('renew',self.events)


class Policy(unittest.TestCase):
    def setUp(self):self.m=module()

    def replies(self):
        result=[]
        for name,kind in self.m.dns_questions():
            values=['ns1.'+self.m.DOMAIN+'.','ns2.'+self.m.DOMAIN+'.'] if kind=='NS' else [self.m.IP] if kind=='A' else []
            result.append({'Status':0,'Answer':[{'type':{'NS':2,'A':1,'AAAA':28}[kind],'data':value} for value in values]})
            if name=='www.'+self.m.DOMAIN and kind=='A':
                result[-1]['Answer'].append({'type':5,'data':self.m.DOMAIN+'.'})
        return result

    def test_public_dns_must_be_complete_and_ipv4_only(self):
        valid=self.replies();self.assertTrue(self.m.valid_dns(valid))
        for index in range(len(valid)):
            invalid=self.replies();invalid[index]={'Status':3};self.assertFalse(self.m.valid_dns(invalid))
        invalid=self.replies();invalid[5]['Answer']=[{'type':28,'data':'2001:db8::1'}]
        self.assertFalse(self.m.valid_dns(invalid))
        invalid=self.replies();invalid[1]['Answer']=[{'type':1,'data':'127.0.0.1'}]
        self.assertFalse(self.m.valid_dns(invalid))

    def test_alias_and_malformed_responses_are_not_accepted(self):
        invalid=self.replies();invalid[2]['Answer']=[{'type':1,'data':self.m.IP}]
        self.assertFalse(self.m.valid_dns(invalid))
        for bad in (None, [], {'Status':0,'Answer':['bad']}, {'Status':0,'TC':True}):
            invalid=self.replies();invalid[-1]=bad;self.assertFalse(self.m.valid_dns(invalid))

    def tcp_output(self,status='NOERROR',answer='',flags='qr rd ra'):
        return ';; ->>HEADER<<- opcode: QUERY, status: '+status+', id: 2\n;; flags: '+flags+'; QUERY: 1, ANSWER: 2\n\n'+answer

    def test_tcp_parser_preserves_dns_status_alias_and_ipv6(self):
        raw=self.tcp_output(answer='www.'+self.m.DOMAIN+'. 300 IN CNAME '+self.m.DOMAIN+'.\n'+self.m.DOMAIN+'. 300 IN A '+self.m.IP+'\n')
        self.assertTrue(self.m.valid_dns_reply('www.'+self.m.DOMAIN,'A',self.m.parse_tcp_dns(raw)))
        for status,code in (('NXDOMAIN',3),('SERVFAIL',2),('REFUSED',5)):
            reply=self.m.parse_tcp_dns(self.tcp_output(status));self.assertEqual(reply['Status'],code)
            self.assertFalse(self.m.valid_dns_reply(self.m.DOMAIN,'AAAA',reply))
        reply=self.m.parse_tcp_dns(self.tcp_output(answer=self.m.DOMAIN+'. 300 IN AAAA 2001:db8::1\n'))
        self.assertFalse(self.m.valid_dns_reply(self.m.DOMAIN,'AAAA',reply))
        for bad in ('',raw+raw,self.tcp_output(flags='rd ra'),raw+'unparsed answer\n'):
            self.assertIn('_error',self.m.parse_tcp_dns(bad))
        self.assertFalse(self.m.valid_dns_reply(self.m.DOMAIN,'AAAA',self.m.parse_tcp_dns(self.tcp_output(flags='qr tc rd ra'))))

    def test_tcp_targets_only_explicit_public_resolver_with_bounded_query(self):
        with patch.object(self.m.shutil,'which',return_value='/usr/bin/dig'), \
             patch.object(self.m.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=self.tcp_output())) as run:
            self.assertEqual(self.m.query_tcp(('1.1.1.1',self.m.DOMAIN,'AAAA'))['Status'],0)
        args=run.call_args.args[0]
        self.assertEqual(args[:5],['/usr/bin/dig','-r','@1.1.1.1',self.m.DOMAIN+'.','AAAA'])
        self.assertIn('+tcp',args);self.assertIn('+time=3',args);self.assertEqual(run.call_args.kwargs['timeout'],5)

    def test_doh_failure_falls_back_to_one_complete_public_tcp_set(self):
        def tcp(item):
            resolver,name,kind=item
            return self.replies()[self.m.dns_questions().index((name,kind))] if resolver=='1.1.1.1' else {'Status':3}
        with patch.object(self.m,'query_doh',return_value={'_error':'connection timeout'}), \
             patch.object(self.m,'query_tcp',side_effect=tcp) as query,redirect_stdout(io.StringIO()) as out:
            self.assertTrue(self.m.public_dns_ready())
        self.assertEqual(query.call_count,14);self.assertIn('Cloudflare TCP: verified',out.getvalue())
        self.assertIn('connection timeout',out.getvalue());self.assertIn('NXDOMAIN',out.getvalue())

    def test_doh_success_skips_tcp_and_partial_resolvers_cannot_be_combined(self):
        def doh(item):return self.replies()[self.m.dns_questions().index(item[1:])]
        with patch.object(self.m,'query_doh',side_effect=doh),patch.object(self.m,'query_tcp') as tcp,redirect_stdout(io.StringIO()):
            self.assertTrue(self.m.public_dns_ready());tcp.assert_not_called()
        def partial(item):
            resolver,name,kind=item;index=self.m.dns_questions().index((name,kind))
            if (resolver=='1.1.1.1' and index==0) or (resolver=='8.8.8.8' and index==1):return {'Status':3}
            return self.replies()[index]
        with patch.object(self.m,'query_doh',return_value={'_error':'connection failed'}), \
             patch.object(self.m,'query_tcp',side_effect=partial),redirect_stdout(io.StringIO()):
            self.assertFalse(self.m.public_dns_ready())

    def test_transport_errors_are_not_reported_as_nxdomain_or_printed_raw(self):
        cases=[(self.m.urllib.error.URLError(TimeoutError('private-proxy')), 'connection timeout'),
               (self.m.urllib.error.URLError('private-proxy'), 'connection failed'),
               (self.m.urllib.error.HTTPError('private-proxy',403,'private',{},None), 'HTTP 403')]
        for error,reason in cases:
            with patch.object(self.m.urllib.request,'urlopen',side_effect=error):
                result=self.m.query_doh(('https://dns.google/resolve',self.m.DOMAIN,'A'))
            self.assertEqual(result,{'_error':reason});self.assertNotIn('private',str(result))

    def test_dns_only_never_opens_lock_or_reads_private_config(self):
        for ready in (True,False):
            with patch.object(self.m.sys,'argv',['tls','--dns-only']), \
                 patch.object(self.m,'public_dns_ready',return_value=ready), \
                 patch.object(self.m.os,'open',side_effect=AssertionError('must not open lock')), \
                 patch.object(self.m,'enable',side_effect=AssertionError('must not enable')),redirect_stdout(io.StringIO()):
                if ready:self.m.main()
                else:
                    with self.assertRaises(SystemExit) as error:self.m.main()
                    self.assertEqual(error.exception.code,2)

    def test_certificate_commands_scope_renewal_and_never_modify_nginx(self):
        with patch.object(self.m.shutil,'which',lambda n:'/usr/sbin/'+n):
            issue,renew=self.m.certificate_commands('/usr/bin/certbot')
        for args in (issue,renew):
            self.assertEqual(args[args.index('--cert-name')+1],self.m.DOMAIN)
            self.assertNotIn('--nginx',args);self.assertNotIn('--force-renewal',args)
        self.assertIn('--webroot',issue);self.assertIn('--dry-run',renew);self.assertIn('--run-deploy-hooks',renew)

    def test_hash_never_contains_plaintext_and_rejects_invalid_input(self):
        value=self.m.password_hash(PASSWORD);self.assertTrue(value.startswith('$6$'));self.assertNotIn(PASSWORD,value)
        for invalid in ('short', 'has spaces in password', 'رمزعبوربلندبرایآزمایش'):
            with self.assertRaisesRegex(RuntimeError,'ASCII'):self.m.password_hash(invalid)

    def test_omitted_worker_group_uses_nginx_username_not_primary_gid(self):
        with patch.object(self.m.pwd,'getpwnam',return_value=SimpleNamespace(pw_gid=999)), \
             patch.object(self.m.grp,'getgrnam',return_value=SimpleNamespace(gr_gid=23)) as group:
            self.assertEqual(self.m.worker_gid('user worker;'),23)
            group.assert_called_once_with('worker')


if __name__=='__main__':unittest.main()
