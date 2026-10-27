#!/usr/bin/env python3
"""Exercise diagnostic phase boundaries without any network requests."""
from pathlib import Path
from unittest.mock import patch, MagicMock
import importlib.util
import socket
import ssl
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('service_access', ROOT / 'deploy/diagnose-service-access.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AccessDiagnostics(unittest.TestCase):
    def test_tcp_timeout_is_not_reported_as_tls_or_filtering(self):
        with patch.object(module.socket, 'create_connection', side_effect=socket.timeout):
            row = module.probe_ip('registry.npmjs.org', '/', '104.16.2.34')
        self.assertEqual(row['failedAt'], 'tcp443')
        self.assertNotIn('tls', row)
        self.assertNotIn('http', row)

    def test_certificate_error_follows_successful_tcp(self):
        with patch.object(module.socket, 'create_connection', return_value=MagicMock()), \
                patch.object(module.ssl, 'create_default_context') as context:
            context.return_value.wrap_socket.side_effect = ssl.SSLCertVerificationError('fixture')
            row = module.probe_ip('registry.npmjs.org', '/', '104.16.2.34')
        self.assertTrue(row['tcp443']['ok'])
        self.assertEqual(row['failedAt'], 'tls')
        self.assertEqual(row['tls']['error'], 'SSLCertVerificationError')

    def test_http_denial_is_reachable_and_does_not_claim_network_filter(self):
        response = MagicMock(status=403)
        with patch.object(module.socket, 'create_connection', return_value=MagicMock()), \
                patch.object(module.ssl, 'create_default_context'), \
                patch.object(module.http.client, 'HTTPResponse', return_value=response):
            row = module.probe_ip('registry.npmjs.org', '/', '104.16.2.34')
        self.assertTrue(row['tcp443']['ok'])
        self.assertTrue(row['tls']['ok'])
        self.assertEqual(row['http']['status'], 403)
        self.assertNotIn('failedAt', row)

    def test_dns_nonpublic_address_does_not_probe_an_internal_service(self):
        with patch.object(module.socket, 'create_connection') as connect:
            row = module.probe_ip('registry.npmjs.org', '/', '10.10.34.34')
        self.assertEqual(row['failedAt'], 'dns-nonpublic-address')
        connect.assert_not_called()

    def test_dns_failure_does_not_invent_a_tcp_or_tls_failure(self):
        with patch.object(module, 'resolve', side_effect=RuntimeError('fixture')):
            row = module.probe(module.TARGETS[1])
        self.assertEqual(row['failedAt'], 'dns')
        self.assertNotIn('testedAddresses', row)


if __name__ == '__main__':
    unittest.main()
